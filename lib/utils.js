const uuidv1 = require('uuid/v1');
const fs = require('fs-extra');
const uuidv4 = require('uuid/v4');
const crypto = require('crypto');
const request = require('request');
const shortid = require('shortid');
const moment = require('moment');
const Clarifai = require('clarifai');
const cheerio = require('cheerio');
const firebase = require('../').firebase;
var database = firebase.database();
const CLEVER_BOT_API_KEY = `CC4pylqvW3VcjX9WjdVqvNjnoqQ`;
const CLARIFAI_API_KEY = `baf7b9e3e8fe4a85afede3fe12655b48`;
const OK_ERRORS =
  ['Please wait a few minutes before you try again.',
    'Sorry, this media has been deleted',
    'Sorry, you cannot like this media',
    'Comments on this post have been limited',
    'The password you entered is incorrect. Please try again.'];
const retryErrorCodes = ['ETIMEDOUT', 'ECONNRESET'];

module.exports = {
  keepOldCookies: function (newCookiesJSON, oldCookiesJSON) {
    return Object.assign({}, newCookiesJSON, oldCookiesJSON);
  },

  cookieResponseToString: function (data) {
    return data.map((cookieString) => {
      let m = cookieString.match(/(.*?);/g) || [""];
      return m[0];
    }).join(' ').replace(';;', ';');
  },

  cookieStringToJSON: function (string) {
    return string.split('; ').reduce(function (result, v, i, a) { var k = v.split('='); result[k[0]] = k[1]; return result; }, {})
  },

  cookieJSONToString: function (json) {
    return Object.keys(json).map((key) => {
      return `${key}=${json[key]}`
    }).join('; ').replace(';;', ';');;
  },

  quoteURL: function (url, safe) {
    if (typeof (safe) !== 'string') {
      safe = '/';    // Don't escape slashes by default
    }

    url = encodeURIComponent(url);

    // Unescape characters that were in the safe list
    let toUnencode = [];
    for (var i = safe.length - 1; i >= 0; --i) {
      var encoded = encodeURIComponent(safe[i]);
      if (encoded !== safe.charAt(i)) {    // Ignore safe char if it wasn't escaped
        toUnencode.push(encoded);
      }
    }

    url = url.replace(new RegExp(toUnencode.join('|'), 'ig'), decodeURIComponent);

    return url;
  },

  randomIntFromInterval: function (min, max, fast = false) {
    if (fast) return 0;
    return Math.floor(Math.random() * (max - min + 1) + min);
  },

  jsonDumps: function (jsonObject) {
    return JSON.stringify(jsonObject).split('":"').join('": "').split('","').join('", "');
  },

  getQueryString: function (query) {
    let esc = encodeURIComponent
    let queryString = Object.keys(query)
      .map(k => esc(k) + '=' + esc(query[k]))
      .join('&');
    return queryString;
  },

  generateUUID: function (type) {
    // #according to https://github.com/LevPasha/Instagram-API-python/pull/16/files#r77118894
    // #uuid = '%04x%04x-%04x-%04x-%04x-%04x%04x%04x' % (random.randint(0, 0xffff),
    // #    random.randint(0, 0xffff), random.randint(0, 0xffff),
    // #    random.randint(0, 0x0fff) | 0x4000,
    // #    random.randint(0, 0x3fff) | 0x8000,
    // #    random.randint(0, 0xffff), random.randint(0, 0xffff),
    // #    random.randint(0, 0xffff))
    var generated_uuid = uuidv4();
    if (type)
      return generated_uuid;
    else
      return generated_uuid.replace(/-/g, '')
  },

  base64_decode: function (b64Encoded) {
    return Buffer.from(b64Encoded, 'base64').toString()
  },

  base64_encode: function (string) {
    return Buffer.from(string).toString('base64');
  },

  timezone_offset_in_seconds: function (dt) {
    return -dt.getTimezoneOffset() * 60;
  },

  makeRandomPassword: function () {
    var string = uuidv4();
    var bufEncode = Buffer.from(string).toString('base64');
    return bufEncode.substr(0, 8);
  },

  getRandomEmail: function () {
    var self = this;
    return new Promise((resolve, reject) => {
      let email = this.makeId() + '@' + this.randomDomain();
      self.requestWithErrorHandling(`https://app.getnada.com/inbox/${email}`, request.get)
        .then(({ body, response }) => {
          if (response.statusCode === 200) resolve(email);
          else if (err) reject(err)
          else reject('something went wrong')
        })
    })
  },
  makeRandomAccount: function () {
    return new Promise((resolve, reject) => {
      console.log('Making new account')
      this.getRandomEmail().then((randomEmail) => {
        console.log('Got Email as', randomEmail)
        var Client = require('./client/');
        new Client().createAccount(randomEmail, this.makeRandomPassword())
          .then(async ({ username, password, email }) => {
            var InstagramAPI = require('./instagram');
            var api = new InstagramAPI(username, password);
            await api.settings.set('email', email)
            await api.settings.set('password', password)
            console.log('user saved successfully')
            console.log('username', username);
            console.log('password', password);
            resolve(api)
          })
          .catch(reject)
      })
    })
  },

  generate_uuid: function (return_hex = false, seed) {
    let new_uuid;
    if (seed) {
      let m = crypto.createHash('md5').update(seed, 'utf8')
      new_uuid = uuidv4(m.digest('hex'))
    }
    else {
      new_uuid = uuidv1()
    }
    if (return_hex)
      return new_uuid.toString(16)
    return new_uuid;
  },

  makeId: function (email) {
    return shortid.generate();
  },

  randomDomain: function (domains) {
    var domains = ['banit.club', 'nada.email', 'amail.club', 'cars2.club']
    return domains[Math.floor(Math.random() * domains.length)];
  },
  randomWithProbability: function (objectOfNumbers) {
    var arryOfNumbers = [];
    for (var key in objectOfNumbers) {
      let counter = 0;
      let total = objectOfNumbers[key]
      while (counter < total) {
        arryOfNumbers.push(key)
        counter++
      }
    }
    var idx = Math.floor(Math.random() * arryOfNumbers.length);
    return arryOfNumbers[idx];
  },
  dateToTimeStamp: function (myDate) {
    if (typeof (myDate) === 'string') {
      //"02-26-2012";
      myDate = myDate.split("-");
      myDate = new Date(myDate[2], parseInt(myDate[0]) + - 1, myDate[1])
    }
    return moment(myDate).format('x')
  },
  normalize: function (x, min, max) {
    return (x - min) / (max - min)
  },

  getMessageFromCaption: function (caption) {
    var match = caption.replace(/#(\w+)|@(\w+)/g, "");
    return match.trim()
  },
  getCommentFromPost: async function (post) {
    var self = this;
    return new Promise(async (resolve, reject) => {
      let defaultMessage = 'Do you like this?';
      let message;
      let url;
      if (post && post.image_versions2 && post.image_versions2.candidates && post.image_versions2.candidates[0])
        url = post.image_versions2.candidates[0].url;
      if (url) {
        message = await self.getChatbotCommentFromPicutre(url)
      }
      if (!message) message = defaultMessage;
      if (message === defaultMessage) message = [];
      var emoji;
      while (!emoji && message.length > 0) {
        var i = self.randomIntFromInterval(0, message.length)
        emoji = await self.getEmojiFromQuery(message[i])
      }
      if (!emoji && message.length === 0) emoji = await self.getRandomEmoji()
      resolve(emoji)
    })
  },
  getChatbotCommentFromPicutre: function (url) {
    return new Promise((resolve, reject) => {
      const app = new Clarifai.App({
        apiKey: CLARIFAI_API_KEY
      });
      // predict the contents of an image by passing in a url
      app.models.predict(Clarifai.GENERAL_MODEL, url).then((response) => {
        let arrayOfGuesses = response.outputs[0].data.concepts.map((obj) => { return obj.name });
        resolve(arrayOfGuesses)
      });
    })
  },
  nonBlockingSleep: function (sleepTime) {
    return new Promise((resolve, reject) => {
      setTimeout(() => { return resolve() }, sleepTime * 1000);
    })
  },
  shuffleObject: function (oldObject) {
    function shuffle(sourceArray) {
      for (var i = 0; i < sourceArray.length - 1; i++) {
        var j = i + Math.floor(Math.random() * (sourceArray.length - i));

        var temp = sourceArray[j];
        sourceArray[j] = sourceArray[i];
        sourceArray[i] = temp;
      }
      return sourceArray;
    }
    var shuffled = shuffle(Object.keys(oldObject))
    var newObj = {};
    for (var key of shuffled) {
      newObj[key] = oldObject[key];
    }
    return newObj;
  },
  getEmojiFromQuery: function (query) {
    var self = this;
    return new Promise((resolve, reject) => {
      self.requestWithErrorHandling(`https://emojipedia.org/search/?q=${query}`, request.get)
        .then(({ body, response }) => {
          const $ = cheerio.load(body);
          if ($('ol p').slice(0, 1).text().includes('No results found.')) {
            resolve('')
          } else {
            //emoji for caption found
            var firstResult = $('ol span').slice(0, 1).text();
            if (firstResult) resolve(firstResult);
            else resolve('')
          }
        })
    })
  },
  getRandomEmoji: function () {
    var self = this;
    return new Promise((resolve, reject) => {
      self.requestWithErrorHandling(`https://emojipedia.org/random/`, request.get)
        .then(({ body, response }) => {
          const $ = cheerio.load(body);
          var firstResult = $('h1 span').slice(0, 1).text();
          if (firstResult) resolve(firstResult);
          else return this.getRandomEmoji();
        })
    })
  },

  saveCookies: function (jar, cookiepath){
    let cookieJSON = jar._jar.toJSON();
    fs.writeJSONSync(cookiepath, cookieJSON);
  },
  requestWithErrorHandling: function (options, _request = request, timeoutAmount = 1, cookiepath) {
    var self = this;
    return new Promise((resolve, reject) => {
      if (typeof (options) === 'string') options = { url: options };
      _request(options, (err, response, body) => {
        setTimeout(() => {
          if (cookiepath && options.jar) self.saveCookies(options.jar, cookiepath);
          let formattedBody = {};
          try { formattedBody = JSON.parse(body) } catch (e) { }
          let responseCode = response && response.statusCode ? response.statusCode : null;
          if (err || responseCode != 200) {
            if ((body && body.includes('try again')) || (err && retryErrorCodes.includes(err.code) || (err && err.message && err.message.includes('Timed Out')) && timeoutAmount <= 5)) {
              this.tryRequestAgain(timeoutAmount * 90, options, _request).then(resolve);
            } else {
              if (body && !body.match(/page not found/ig)) {
                console.log('There was an error', JSON.stringify(options), err, body);
                fs.ensureFileSync('./log.txt');
                var exec = require('child_process').exec;
                let output = moment().format("dddd, MMMM Do YYYY, h:mm:ss a") + " " + JSON.stringify(options) + err + body;
                let filepath = `./log.txt`;
                exec(`echo "${output}" >> ${filepath}`);
                //This error is expected
                return resolve({});
              }
            }
          } else {
            return resolve({ response, body })
          }
        }, 500);
      })
    })
  },
  tryRequestAgain: function (secs, options, _request) {
    var self = this;
    _request = _request || request;
    return new Promise(async (resolve, reject) => {
      console.log('trying request again in', secs, 'seconds')
      await self.nonBlockingSleep(secs);
      self.requestWithErrorHandling(options, _request, (secs / 90) + 1).then(resolve);
    })
  },
  postIsClean: function (post, safeMode, video = false) {
    return new Promise((resolve, reject) => {
      var self = this;
      if (!safeMode) return resolve(true);
      const app = new Clarifai.App({
        apiKey: CLARIFAI_API_KEY
      });
      let picURL;
      let videoURL;
      let url;
      if (typeof (post) === 'string') {
        let postMatch = post.match(/(https.*\/)/) || [""];
        url = postMatch[1] + 'media/?size=l';
      } else {
        if (post && post.image_versions2 && post.image_versions2.candidates && post.image_versions2.candidates[0])
          picURL = post.image_versions2.candidates[0].url;
        if (post && post.video_versions && post.video_versions[0] && post.video_versions[0].url)
          videoURL = post.video_versions[0].url
        // predict the contents of an image by passing in a url
        url = videoURL ? videoURL : picURL;
      }
      app.models.predict(Clarifai.MODERATION_MODEL, url, { video: !!videoURL || video }).then((results) => {
        let output;
        if (results.outputs[0] &&
          results.outputs[0].data &&
          results.outputs[0].data.frames) {
          output = results.outputs[0].data.frames;
          for (var i = 0; i < output.length; i++) {
            for (var j = 0; i < output[i][j].length; i++) {
              let frameConcept = output[i][j];
              if (frameConcept.name === 'explicit' || frameConcept.name === 'suggestive') {
                if (frameConcept.value >= .6) return resolve(false)
              }
            }
          }
        } else if (results.outputs[0] &&
          results.outputs[0].data &&
          results.outputs[0].data.concepts) {
          output = results.outputs[0].data.concepts;
          for (var i = 0; i < output.length; i++) {
            var frameConcept = output[i];
            if (frameConcept.name === 'explicit' || frameConcept.name === 'suggestive') {
              if (frameConcept.value >= .5) return resolve(false)
            }
          }
        }
        resolve(true)
      }, (response) => {
        console.log('Something is wrong with clarifai', response)
        if (response.statusText.includes('Back-end server is at capacity')) {
          console.log('Server overloaded trying again')
          setTimeout(() => {
            self.postIsClean(post, video).then(resolve)
          }, 30 * 1000)
        }
      })
    })
  },
  shouldActOnPost: function (followingAmount, followerAmount, numberOfPosts) {
    var self = this;
    let is_celebrity, is_fake_account, is_active_user;
    if ((followerAmount / followingAmount) > 2) {
      is_celebrity = true
      is_fake_account = false
      console.log('This is probably a celebrity account')
    }
    else if ((followingAmount / followerAmount) > 2) {
      is_fake_account = true
      is_celebrity = false
      console.log('This is probably a fake account')
    }
    else {
      is_celebrity = false
      is_fake_account = false
      console.log('This is a probably normal account')
    }
    if ((followingAmount / numberOfPosts < 10) && (followerAmount / numberOfPosts < 10)) {
      is_active_user = true
      console.log('This user is probably active')
    }
    else {
      is_active_user = false
      console.log('This user is probably passive')
    }
    return !is_fake_account && !is_celebrity && is_active_user;
  },
  postActionToFirebase: function (username, data, push = true) {
    return new Promise((resolve, reject) => {
      let endpoint = `users/${this.filterUsername(username)}/bot/actions/`;
      var newPostKey = database.ref().child(endpoint).push().key;
      var updates = {};
      updates[endpoint + newPostKey + '/action'] = data.action;
      updates[endpoint + newPostKey + '/tags'] = data.tags;
      updates[endpoint + newPostKey + '/timestamp'] = data.timestamp;
      updates[endpoint + newPostKey + '/user'] = data.user;
      database.ref().update(updates)
        .then(resolve)
        .catch(reject)
    })
  },
  updateFollowerFromFirebase: function (username, usernameId, data) {
    return new Promise((resolve, reject) => {
      let endpoint = `users/${this.filterUsername(username)}/bot/follower/${usernameId}`;
      database.ref(endpoint).set(data)
        .then(resolve)
        .catch(reject)
    })
  },
  addToUnfollowList: function (username, unfollowUsername) {
    return new Promise((resolve, reject) => {
      let endpoint = `users/${this.filterUsername(username)}/bot/unfollow`;
      database.ref(endpoint).push(unfollowUsername)
        .then(resolve)
        .catch(reject)
    })
  },
  listenForOptionUpdates: function (username, callback) {
    database.ref(`users/${this.filterUsername(username)}/bot/settings/options`).on('value', callback)
  },
  getBotSetting: async function (username, key) {
    let snap = await database.ref(`users/${this.filterUsername(username)}/bot/settings/${key}`).once('value')
    return snap.val()
  },
  setBotSetting: async function (username, key, data) {
    return await database.ref(`users/${this.filterUsername(username)}/bot/settings/${key}`).set(data)
  },
  getUnfollowUserFromFirebase: async function (username) {
    let snapshot = await database.ref(`users/${this.filterUsername(username)}/bot/unfollow`).orderByKey().limitToFirst(1).once('value')
    if (!snapshot.val()) return;
    let key = Object.keys(snapshot.val())[0];
    let userToDelete = snapshot.val()[key]
    return await database.ref(`users/${this.filterUsername(username)}/bot/unfollow/${key}`).remove()
  },
  getFollowerListFromFirebase: async function (username) {
    let snapshot = await database.ref(`users/${this.filterUsername(username)}/bot/follower`).once('value');
    return snapshot.val();
  },
  setFollowerListInFirebase: async function (username, followers) {
    return await database.ref(`users/${this.filterUsername(username)}/bot/follower`).set(followers);
  },
  getInstagramSetting: async function (username, key) {
    let snap = await database.ref(`users/${this.filterUsername(username)}/settings/${key}`).once('value')
    return snap.val()
  },
  removeFirebaseUser: async function (username) {
    await database.ref(`users/${this.filterUsername(username)}`).remove();
  },
  setInstagramSetting: async function (username, key, data) {
    return await database.ref(`users/${this.filterUsername(username)}/settings/${key}`).set(data)
  },
  getInstagramCookies: async function (username, key, data) {
    return await database.ref(`users/${this.filterUsername(username)}/cookies`).once('value')
  },
  getQEExposePost: function () {
    let z = Math.floor(2147483648 * Math.random()).toString(36);
    let e = [
      {
        "page_id": z,
        "posts": [
          ["qe:expose",
            { "qe": "deact" }
            , Date.now(), 0
          ],
          ["qe:expose",
            { "qe": "feed_perf" },
            Date.now(), 0],
          ["qe:expose", { "qe": "follow_button" },
            Date.now(), 0]
        ],
        "trigger": "qe:expose",
        "send_method": "ajax"
      }
    ]
    let x = {
      q: JSON.stringify(e),
      ts: Date.now()
    }
    return x;
  },
  filterUsername: function (name) {
    return name.replace(/\.|\#|\[|\]|\$/, '_');
  },
  getProbsFromOptions: function (options, isFollowing, isFollower) {
    return {
      probLike: {
        like: options.like * 100,
        notLike: 100 - options.like * 100
      },
      probComment: {
        //they are already following no need to perform action
        comment: isFollowing || isFollower ? 0 : options.comment * 100,
        notComment: isFollowing || isFollower ? 100 : 100 - options.comment * 100
      },
      probFollow: {
        //they are already following no need to perform action
        follow: isFollowing || isFollower ? 0 : options.follow * 100,
        notFollow: isFollowing || isFollower ? 100 : 100 - options.follow * 100
      }
    }
  },
  getPredictions: async function (post) {
    const app = new Clarifai.App({
      apiKey: CLARIFAI_API_KEY
    });
    let { outputs: [{ data: { concepts } }] } = await app.models.predict(Clarifai.GENERAL_MODEL, post.thumbnail_src);
    let sorted = concepts.sort((a, b) => { return b.value - a.value });
    return sorted.map(({ name, value }) => { return { name: name, value: value * 10 } })
      .splice(0, 10);
  },
  getCommentFromDataBase: function (post) {
    return new Promise(async (resolve, reject) => {
      let predictions = await this.getPredictions(post);
      request.get(`https://us-central1-instagram-api-node.cloudfunctions.net/comment?predictions=${JSON.stringify(predictions)}`, (err, res, body) => {
        resolve(body);
      })
    })
  },
  postActionToDatabaseFeed: function (username, type, post, timestamp) {
    return;
    // return new Promise((resolve, reject) => {
    //   let endpoint = `users/${this.filterUsername(username)}/bot/feed/${type}/`;
    //   var newPostKey = database.ref().child(endpoint).push().key;
    //   var updates = {};
    //   updates[endpoint + newPostKey + '/post'] = post.shortcode || post.code;
    //   updates[endpoint + newPostKey + '/timestamp'] = timestamp;
    //   database.ref().update(updates)
    //     .then(resolve)
    //     .catch(reject)
    // })
  }
}