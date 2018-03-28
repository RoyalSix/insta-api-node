const request = require('request');
var { sleep } = require('sleep');
const fs = require('fs-extra');
const utf8 = require('utf8');
var utils = require('./utils.js');
const crypto = require('crypto');
const { timezone_offset_in_seconds, jsonDumps, randomIntFromInterval, quoteURL, getCookies, getQueryString, generateUUID, base64_encode, cookieStringToJSON, cookieJSONToString, nonBlockingSleep, requestWithErrorHandling } = require('./utils.js');
const EXPERIMENTS = require('../static/experiments');
const cheerio = require('cheerio');
const { LOGIN_QUERY, LOGIN_EXPERIMENTS, SURFACE_PARAM, EXPERIMENTS_REFRESH, IG_CAPABILITIES, USER_AGENT, API_URL, SIG_KEY_VERSION, IG_SIG_KEY, IG_VERSION, VERSION_CODE, USER_AGENT_LOCALE } = require('../static/constants');

var User = require('./user/');
var Settings = require('./settings/');
var Device = require('./device/');
var Client = require('./client/');
var Challenge = require('./challenge/');

function Instagram(username, password = '', debug = false) {
  this.user = new User(username, password);
  this.settings = new Settings(this);
  this.client = new Client(this);
  this.debug = debug;
};

Instagram.prototype = {};

/**
 * 
 * @param {*} username 
 * @param {*} password 
 * @returns Promise<Instagram> */
Instagram.prototype.login = async function (forceLogin = false) {
  await this.setUser();
  if (!this.isLoggedIn || forceLogin) {
    if (!this.debug) console.log('logging in')
    await this.preLogin();
    let data = {
      'username': this.user.username,
      'password': this.user.password
    }
    let loginResult;
    try {
      loginResult = await this.client.makeRequest('accounts/login/ajax/', data)
        .addHeader('X-CSRFToken', this.client.getToken())
        .addHeader('Connection', 'keep-alive')
        .addHeader('X-Instagram-AJAX', 1)
        .addHeader('Referer', 'https://www.instagram.com/')
        .addHeader('X-Requested-With', 'XMLHttpRequest')
        .setProxy(this.useProxy).send()
    } catch (e) {
      console.log(e)
    }
    if (loginResult.status === 'fail' || loginResult.message === 'checkpoint_required') {
      await this.doChallenge(loginResult.checkpoint_url)
      return await this.login(true);
    } else if (loginResult.message === 'The password you entered is incorrect. Please try again.') {
      return false
    }
    else if (loginResult.authenticated) {
      //chance for cookies to be written to file system
      return new Promise((resolve, reject) => {
        setTimeout(async () => {
          if (!this.debug) console.log('Logged In', 'pretending to be real user so no ban')
          if (this.user.password) await this.settings.set('password', this.user.password)
          let working = await this.emulateRealDevice()
          if (!working) return await this.login(true);
          return resolve(this.client.getToken());
        }, randomIntFromInterval(1 * 1000, 5 * 1000, this.debug))
      })
    } else {
      return false;
    }
  } else {
    if (!this.debug) console.log('Already logged in')
    let working = await this.emulateRealDevice();
    if (!working) {
      this.eraseAllSettings()
      return await this.login(true);
    }
    return this.client.getToken();
  }
}

Instagram.prototype.setProxyOption = function (val) {
  this.useProxy = val;
}

Instagram.prototype.doChallenge = async function (challengeObj) {
  this.eraseAllSettings()
  return await this.tryToSkipChallenge();
  // var challenge = new Challenge(this);
  // return challenge.resolve(challengeObj)
}

Instagram.prototype.tryToSkipChallenge = function () {
  var self = this;
  return new Promise((resolve, reject) => {
    var url = `https://www.instagram.com/challenge`;
    utils.requestWithErrorHandling({ url }, request.get).then(() => {
      utils.requestWithErrorHandling({ url, method: 'POST', body: 'choice=0' }, request).then(({ body, response, err }) => {
        try {
          if (JSON.parse(body).staus === 'ok') resolve(true)
        } catch (e) {
          reject(e);
        }
      });
    });
  });
}

Instagram.prototype.eraseAllSettings = function () {
  fs.removeSync(this.settings.userFolder)
  fs.ensureDirSync(this.settings.userFolder)
}

Instagram.prototype.getUsernameFromPost = function (post) {
  var self = this;
  return new Promise((resolve, reject) => {
    var url = `https://www.instagram.com/p/${post.shortcode || post.code}/?__a=1`;
    utils.requestWithErrorHandling({ url }, request.get).then(({ body, response, err }) => {
      resolve(JSON.parse(body).graphql.shortcode_media.owner.username);
    }).catch((e) => {
      if (!self.mute) console.log(e)
      resolve()
    })
  })
}

Instagram.prototype.getPostAsJSON = function (code, get = request.get) {
  var self = this;
  return new Promise((resolve, reject) => {
    var url = `https://www.instagram.com/p/${code}/?__a=1`;
    utils.requestWithErrorHandling({ url }, get).then(({ body, response, err }) => {
      resolve(JSON.parse(body));
    }).catch((e) => {
      if (!self.mute) console.log(e)
      console.log(url);
      resolve()
    })
  })
}

Instagram.prototype.getUserFeed = function (targetUserName, maxid = '', minTimestamp = '', maxTimestamp = '') {
  var self = this;
  return new Promise((resolve, reject) => {
    var url = 'https://www.instagram.com/' + targetUserName + '/?__a=1';

    let data = {
      max_id: maxid,
      min_timestamp: minTimestamp,
      max_timestamp: maxTimestamp
    }
    url += '&' + utils.getQueryString(data);
    utils.requestWithErrorHandling(url, request.get).then(({ body, response, err }) => {
      let resultObject = JSON.parse(body);
      let user = resultObject && resultObject.user ? resultObject.user : null;
      if (!user || !user.media) return resolve({});
      else {
        let posts = user.media.nodes;
        resolve({ items: posts, user });
      }
    }).catch((e) => {
      if (!self.mute) console.log(e)
      resolve({})
    })
  })
}

Instagram.prototype.getLocationFeed = function (query) {
  return this.getLocationFeedByName(query)
    .then((locationId) => this.getLocationFeedById(locationId));
}

Instagram.prototype.getLocationFeedByName = function (query) {
  return new Promise((resolve, reject) => {
    let data = {
      rank_token: this.rank_token,
      query: query
    }
    this.client.callApi('fbsearch/places/', null, data).then((list) => {
      return resolve(list.items[0].location.facebook_places_id)
    })
  })
}

Instagram.prototype.getLocationFeedById = function (locationId, maxid = '') {
  let data = {
    max_id: maxid,
    rank_token: this.rank_token,
    ranked_content: true
  }
  return this.client.callApi(`feed/location/${locationId}/`, null, data)
}

Instagram.prototype.getHashtagFeed = function (hashtagString, maxid = '') {
  var self = this;
  return new Promise((resolve, reject) => {
    var url = `https://www.instagram.com/explore/tags/${hashtagString}/?__a=1`
    let data = {
      max_id: maxid,
      ranked_content: true
    }
    url += '&' + utils.getQueryString(data);
    utils.requestWithErrorHandling(url, request.get).then(({ body, response, err }) => {
      let posts = JSON.parse(body).graphql.hashtag.edge_hashtag_to_media.edges;
      resolve({ items: posts.map((post) => post.node) });
    }).catch((e) => {
      if (!self.mute) console.log(e)
      resolve({})
    })
  })
}

Instagram.prototype.getTopHashtagFeed = function (hashtagString, maxid = '', get = request.get) {
  var self = this;
  return new Promise((resolve, reject) => {
    var url = `https://www.instagram.com/explore/tags/${hashtagString}/?__a=1`
    utils.requestWithErrorHandling(url, get).then(({ body, response, err }) => {
      let posts = JSON.parse(body).graphql.hashtag.edge_hashtag_to_top_posts.edges;
      resolve({ items: posts.map((post) => post.node) });
    }).catch((e) => {
      if (!self.mute) console.log(e);
      resolve({});
    })
  })
}

Instagram.prototype.getMediaLikers = function (mediaId) {
  return this.client.callApi(`media/${mediaId}/likers/?`)
}

Instagram.prototype.like = function (mediaId, mediaCode, username) {
  let referrer = mediaCode && username ? `https://www.instagram.com/p/${mediaCode}/?taken-by=${username}` :
    'https://www.instagram.com';
  return this.client.makeRequest(`web/likes/${mediaId}/like/`)
    .addHeader('Content-Type', 'application/x-www-form-urlencoded')
    .addHeader('X-Requested-With', 'XMLHttpRequest')
    .addHeader('X-CSRFToken', this.client.getToken())
    .addHeader('Referer', referrer)
    .addHeader('X-Instagram-AJAX', 1)
    .setMethod('POST')
    .setProxy(this.useProxy).send()
}



Instagram.prototype.unlike = function (mediaId, mediaCode, username) {
  return this.client.makeRequest(`web/likes/${mediaId}/unlike/`)
    .addHeader('Content-Type', 'application/x-www-form-urlencoded')
    .addHeader('X-Requested-With', 'XMLHttpRequest')
    .addHeader('X-CSRFToken', this.client.getToken())
    .addHeader('Referer', `https://www.instagram.com/p/${mediaCode}/?taken-by=${username}`)
    .setMethod('POST')
    .setProxy(this.useProxy).send()
}

Instagram.prototype.getMediaComments = function (shortcode, after = '') {
  let data;
  if (after == '') {
    data = {
      query_id: "17852405266163336",
      variables: JSON.stringify({ shortcode, "first": 20 })
    }
    return this.client.makeRequest('graphql/query/', data)
      .addHeader('X-Requested-With', 'XMLHttpRequest')
      .addHeader('Referer', `https://www.instagram.com/p/${shortcode}/?explore=true`)
      .setMethod('GET')
      .setProxy(this.useProxy).send()
  }
  else {
    data = {
      query_id: "17852405266163336",
      variables: JSON.stringify({ shortcode, "first": 20, after })
    }
    return this.client.makeRequest('graphql/query/', data)
      .addHeader('X-Requested-With', 'XMLHttpRequest')
      .addHeader('Referer', `https://www.instagram.com/p/${shortcode}/?explore=true`)
      .setMethod('GET')
      .setProxy(this.useProxy).send()
  }
}

Instagram.prototype.comment = function (mediaId, mediaCode, commentText, username) {
  let data = {
    comment_text: commentText
  }
  return this.client.makeRequest(`web/comments/${mediaId}/add/`, data)
    .addHeader('Content-Type', 'application/x-www-form-urlencoded')
    .addHeader('X-Requested-With', 'XMLHttpRequest')
    .addHeader('X-CSRFToken', this.client.getToken())
    .addHeader('Referer', `https://www.instagram.com/p/${mediaCode}/?taken-by=${username}`)
    .addHeader('X-Instagram-AJAX', 1)
    .setMethod('POST')
    .setProxy(this.useProxy).send()
}

Instagram.prototype.deleteComment = function (mediaId, mediaCode, commentId, username) {
  return this.client.makeRequest(`web/comments/${mediaId}/delete/${commentId}/`)
    .addHeader('Content-Type', 'application/x-www-form-urlencoded')
    .addHeader('X-Requested-With', 'XMLHttpRequest')
    .addHeader('X-CSRFToken', this.client.getToken())
    .addHeader('Referer', `https://www.instagram.com/p/${mediaCode}/?taken-by=${username}`)
    .addHeader('X-Instagram-AJAX', 1)
    .setMethod('POST')
    .setProxy(this.useProxy).send()
}

Instagram.prototype.getUserLikedMedia = function (maxid = '') {
  let data = {
    max_id: maxid
  }
  return this.client.callApi(`feed/liked/`, null, data)
}


Instagram.prototype.follow = function (usernameId, username) {
  return this.client.makeRequest(`web/friendships/${usernameId}/follow/`)
    .addHeader('X-Instagram-Ajax', 1)
    .addHeader('Content-Type', 'application/x-www-form-urlencoded')
    .addHeader('X-Requested-With', 'XMLHttpRequest')
    .addHeader('Upgrade-Insecure-Requests', 1)
    .addHeader('X-CSRFToken', this.client.getToken())
    .addHeader('Referer', `https://www.instagram.com/${username}/`)
    .setMethod('POST')
    .setProxy(this.useProxy).send()
};

Instagram.prototype.unfollow = function (usernameId, username) {
  return this.client.makeRequest(`web/friendships/${usernameId}/unfollow/`)
    .addHeader('X-Instagram-Ajax', 1)
    .addHeader('Content-Type', 'application/x-www-form-urlencoded')
    .addHeader('X-Requested-With', 'XMLHttpRequest')
    .addHeader('Upgrade-Insecure-Requests', 1)
    .addHeader('X-CSRFToken', this.client.getToken())
    .addHeader('Referer', username ? `https://www.instagram.com/${username}/` : null)
    .setMethod('POST')
    .setProxy(this.useProxy).send()
};

Instagram.prototype.getAllUserFollowers = async function (username, usernameId) {
  let end_cursor;
  let followers = [];
  usernameId = usernameId || await this.getUserId(username);
  if (!usernameId) {
    return [];
  }
  while (true) {
    let resultObject = await this.getUserFollowers(usernameId, end_cursor, username);
    let edge_followed_by = resultObject && resultObject.data && resultObject.data.user && resultObject.data.user.edge_followed_by ?
      resultObject.data.user.edge_followed_by : { edges: [] };
    for (var item of edge_followed_by.edges)
      followers.push(item.node)
    if (!edge_followed_by.page_info || !edge_followed_by.page_info.has_next_page) {
      return followers;
    }
    if (randomIntFromInterval(0, 2) === 2) await nonBlockingSleep(randomIntFromInterval(5, 30));
    else if (randomIntFromInterval(0, 15) >= 13) await nonBlockingSleep(randomIntFromInterval(30, 120));
    else await nonBlockingSleep(randomIntFromInterval(0, 5))
    end_cursor = edge_followed_by.page_info ? edge_followed_by.page_info.end_cursor : null;
  }
};

Instagram.prototype.getUserFollowers = function (usernameId, maxid = '', username) {
  let data;
  if (maxid == '') {
    data = {
      query_id: "17851374694183129",
      variables: JSON.stringify({ "id": usernameId, "first": 20 })
    }
    return this.client.makeRequest('graphql/query/', data)
      .addHeader('X-Requested-With', 'XMLHttpRequest')
      .addHeader('Referer', `https://www.instagram.com/${username}/followers/`)
      .setMethod('GET')
      .setProxy(this.useProxy).send()
  }
  else {
    data = {
      query_id: "17851374694183129",
      "id": usernameId,
      "first": randomIntFromInterval(40, 50),
      "after": maxid
    }
    return this.client.makeRequest('graphql/query/', data)
      .addHeader('X-Requested-With', 'XMLHttpRequest')
      .addHeader('Referer', `https://www.instagram.com/${username}/followers/`)
      .setMethod('GET')
      .setProxy(this.useProxy).send()
  }
}


Instagram.prototype.getAllUserFollowing = async function (username, usernameId, end_cursor, max = 200) {
  let following = [];
  usernameId = usernameId || await this.getUserId(username);
  if (!usernameId) {
    return [];
  }
  while (following.length <= max) {
    let resultObject = await this.getUserFollowing(usernameId, end_cursor, username);
    let edge_follow = resultObject && resultObject.data && resultObject.data.user && resultObject.data.user.edge_followed_by ?
      resultObject.data.user.edge_followed_by : { edges: [] };
    for (var item of edge_follow.edges)
      following.push(item.node)
    if (!edge_follow.page_info || !edge_follow.page_info.has_next_page) break;
    if (randomIntFromInterval(0, 2) === 2) await nonBlockingSleep(randomIntFromInterval(5, 30));
    else if (randomIntFromInterval(0, 15) >= 13) await nonBlockingSleep(randomIntFromInterval(30, 120));
    else await nonBlockingSleep(randomIntFromInterval(0, 5))
    end_cursor = edge_follow.page_info ? edge_follow.page_info.end_cursor : null;
  }
  return {
    following,
    end_cursor,
    usernameId
  };
};

Instagram.prototype.getUserFollowing = function (usernameId, maxid = '', username) {
  let data;
  if (maxid == '') {
    data = {
      query_id: "17874545323001329",
      variables: JSON.stringify({ "id": usernameId, "first": 20 })
    }
    return this.client.makeRequest('graphql/query/', data)
      .addHeader('X-Requested-With', 'XMLHttpRequest')
      .addHeader('Referer', `https://www.instagram.com/${username}/following/`)
      .setMethod('GET')
      .setProxy(this.useProxy).send()
  }
  else {
    data = {
      query_id: "17874545323001329",
      "id": usernameId,
      "first": randomIntFromInterval(40, 50),
      "after": maxid
    }
    return this.client.makeRequest('graphql/query/', data)
      .addHeader('X-Requested-With', 'XMLHttpRequest')
      .addHeader('Referer', `https://www.instagram.com/${username}/following/`)
      .setMethod('GET')
      .setProxy(this.useProxy).send()
  }
}



Instagram.prototype.getUserId = function (targetUserName) {
  var self = this;
  return new Promise((resolve, reject) => {
    this.getUserInfo(targetUserName).then(function (output) {
      if (output && output.user && output.user.id) {
        return resolve(output.user.id);
      } else {
        return resolve();
      }
    }).catch((e) => {
      if (!self.mute) console.log('error getting user id')
      if (!self.mute) console.log(e, e.stack, console.trace())
      return reject(e)
    })
  })
}

Instagram.prototype.getSelfInfo = function () {
  let data = {
    '_uuid': this.user.uuid,
    '_uid': this.user.account_id,
    '_csrftoken': this.client.getToken(),
    edit: true
  }
  return this.client.callApi('accounts/current_user/', data)
}

Instagram.prototype.getUserInfo = function (targetUserName, get = request.get) {
  var self = this;
  return new Promise((resolve, reject) => {
    var url = 'https://www.instagram.com/' + targetUserName + '/?__a=1';

    utils.requestWithErrorHandling(url, get).then(({ body, response, err }) => {
      resolve(JSON.parse(body))
    })
      .catch((e) => {
        console.log('There was a problem getting user', targetUserName);
        resolve()
      })

  })
}

Instagram.prototype.getUserFollowStatus = function (username) {
    return this.client.makeRequest(`${username}/?__a=1`)
    .addHeader('X-Requested-With', 'XMLHttpRequest')
    .addHeader('Referer', `https://www.instagram.com/`)
    .setMethod('GET')
    .setProxy(this.useProxy).send()
}

/**
    * Set the active account for the class instance.
    *
    * We can call this multiple times to switch between multiple accounts.
    *
    * @param string username Your Instagram username.
    * @param string password Your Instagram password.
    *
    * @throws \InvalidArgumentException
    * @throws \InstagramAPI\Exception\InstagramException
    */
Instagram.prototype.setUser = async function () {
  let { username, password } = this.user;
  // Load all settings from the storage and mark as current user.
  await this.settings.setActiveUser(username);

  // Generate the user's Device instance, which will be created from the
  // user's last-used device IF they've got a valid, good one stored.
  // But if they've got a BAD/none, this will create a brand-new device.
  let savedDeviceString = await this.settings.get('devicestring');
  this.device = new Device(savedDeviceString)
  // Get active device string so that we can compare it to any saved one.
  let deviceString = this.device.deviceString;

  // Generate a brand-new device fingerprint if the Device wasn't reused
  // from settings, OR if any of the stored fingerprints are missing.
  // NOTE: The regeneration when our device model changes is to avoid
  // dangerously reusing the "previous phone's" unique hardware IDs.
  // WARNING TO CONTRIBUTORS: Only add new parameter-checks here if they
  // are CRITICALLY important to the particular device. We don't want to
  // frivolously force the users to generate new device IDs constantly.
  let resetCookieJar = false;
  if (deviceString !== savedDeviceString) {
    // Brand new device, or missing
    // Erase all previously stored device-specific settings.
    this.settings.eraseDeviceSettings();

    // Save the chosen device string to settings.
    await this.settings.set('devicestring', deviceString);

    // Erase any stored account ID, to ensure that we detect ourselves
    // as logged-out. This will force a new relogin from the new device.

    // We'll also need to throw out all previous cookies.
    resetCookieJar = true;
  }

  // Store various important parameters for easy access.
  this.username = username;
  this.password = password;

  // Load the previous session details if we're possibly logged in.
  if (!resetCookieJar && await this.settings.isMaybeLoggedIn()) {
    this.isLoggedIn = true;
  } else {
    this.isLoggedIn = false;
  }

  // Configures Client for current user AND updates isLoggedIn state
  // if it fails to load the expected cookies from the user's jar.
  // Must be done last here, so that isLoggedIn is properly updated!
  // NOTE: If we generated a new device we start a new cookie jar.
  this.client.updateFromCurrentSettings(resetCookieJar);
}


Instagram.prototype.preLogin = function () {
  return this.client.makeRequest()
    .addHeader('Connection', 'keep-alive')
    .addHeader('Accept-Encoding', 'gzip, deflate')
    .addHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')
    .addHeader('Upgrade-Insecure-Requests', 1)
    .setProxy(this.useProxy).send()
}

Instagram.prototype.emulateRealDevice = async function () {
  let working = true;
  await this.goBackToHomePage()
  nonBlockingSleep(randomIntFromInterval(0, 1))
  await this.fetchWeb()
  if (working && working.message && !working.message.includes('unauthorized')) working = false;
  nonBlockingSleep(randomIntFromInterval(0, 1))
  await this.QEExpose()
  nonBlockingSleep(randomIntFromInterval(0, 1))
  return working;
}

Instagram.prototype.goBackToHomePage = function () {
  return this.client.makeRequest()
    .addHeader('Connection', 'keep-alive')
    .addHeader('Accept-Encoding', 'gzip, deflate')
    .addHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')
    .addHeader('Cache-Control', 'max-age=0')
    .setProxy(this.useProxy).send()
}

Instagram.prototype.fetchWeb = function () {
  let data = {
    query: LOGIN_QUERY,
    surface_param: 5095,
    vc_policy: 'default',
    version: 1
  }
  return this.client.makeRequest('qp/fetch_web/', data)
    .addHeader('Connection', 'keep-alive')
    .addHeader('X-Instagram-AJAX', 1)
    .addHeader('Referer', 'https://www.instagram.com/')
    .addHeader('X-Requested-With', 'XMLHttpRequest')
    .addHeader('Cache-Control', 'max-age=0')
    .addHeader('X-CSRFToken', this.client.getToken())
    .setProxy(this.useProxy).send()
}

Instagram.prototype.QEExpose = function () {
  let data = utils.getQEExposePost();
  return this.client.makeRequest('ajax/bz', data)
    .addHeader('Content-Type', 'application/x-www-form-urlencoded')
    .addHeader('X-Instagram-AJAX', 1)
    .addHeader('Referer', 'https://www.instagram.com/')
    .addHeader('X-Requested-With', 'XMLHttpRequest')
    .addHeader('X-CSRFToken', this.client.getToken())
    .setProxy(this.useProxy).send()
}

Instagram.prototype.getAccountStatsWeb = function (username) {
  var self = this;
  return new Promise((resolve, reject) => {
    utils.requestWithErrorHandling(`https://www.instagram.com/${username}/`, request.get).then(({ body }) => {
      const $ = cheerio.load(body);
      let statsString = $('meta').map(function (i, el) {
        if ($(el).attr('property') === 'og:description') {
          return $(el).attr('content')
        }
      })[0];
      let followers = statsString.match(/(\d+(?= Followers))/, 'g')[0];
      let following = statsString.match(/(\d+(?= Following))/, 'g')[0];
      let postsAmount = statsString.match(/(\d+(?= Posts))/, 'g')[0];
      resolve({ followers, following, postsAmount })
    }).catch((e) => {
      if (!self.mute) console.log(e)
      resolve({})
    })
  })
}

Instagram.prototype.getAccessTokenFromLogin = async function () {
  let result = await this.login();
  if (result) return result;
  else {
    await this.removeUserEntry();
    return false;
  }
}

Instagram.prototype.removeUserEntry = async function () {
  this.eraseAllSettings();
  return await utils.removeFirebaseUser(this.user.username);
}

module.exports = Instagram;
