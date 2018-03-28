const path = require('path-extra');
const utils = require('../utils');
const fs = require('fs-extra')
const request = require('request');
var kill = require('tree-kill');
const { spawn } = require('child_process');
var tough = require('tough-cookie');
var tor = require('tor-request');
var { sleep } = require('sleep');
const { USERAGENT, API_URL, SIG_KEY_VERSION, IG_SIG_KEY } = require('../../static/constants');
const crypto = require('crypto');
const publicIp = require('public-ip');
const proxyAddressList = ['http://174.138.69.29:8080', 'http://138.197.230.116:55555']

//https://www.whatismyip.com/blacklist-check

function Client(parent) {
  this.userAgent = null;
  this.parent = parent;
  this.headers = {
    'Connection': 'close',
    'Accept': '*/*',
    'Accept-Language': 'en-US',
    'Host': 'www.instagram.com',
    'Content-Type': 'application/x-www-form-urlencoded'
  }
  
  // this.proxyAddress = proxyAddressList[0];
  // setInterval(() => {
  //   this.startProxyCylcer(this.proxyAddress);
  // }, utils.randomIntFromInterval(10 * 60, 60 * 60) * 1000);
}

Client.prototype = {};

Client.prototype.startProxyCylcer = function (currentAddy) {
  let tempAddys = proxyAddressList.slice(0);
  var index = tempAddys.indexOf(currentAddy);
  if (index > -1) {
    tempAddys.splice(index, 1);
  } else { console.log('Something wrong with proxy cycler') }
  this.proxyAddress = tempAddys[utils.randomIntFromInterval(0, tempAddys.length - 1)];
  console.log('Changed proxy address to', this.proxyAddress)
}

Client.prototype.updateFromCurrentSettings = function (resetCookieJar = false) {
  let jar;
  // create the json file if it does not exist
  this.headers['User-Agent'] = this.parent.device.userAgent;
  this.cookiepath = path.join(this.parent.settings.userFolder, 'cookies.json');
  if (!fs.existsSync(this.cookiepath)) {
    fs.closeSync(fs.openSync(this.cookiepath, 'w'));
  }
  try {
    let oldStore = fs.readJSONSync(this.cookiepath);
    var CookieJar = tough.CookieJar;
    jar = request.jar(CookieJar.fromJSON(oldStore).store);
  } catch (e) {
    console.log('Error getting old cookies, clearing them.');
    fs.removeSync(this.cookiepath);
    fs.closeSync(fs.openSync(this.cookiepath, 'w'));
    jar = request.jar();
  }
  // Update our internal client state from the new user's settings.
  // use the FileCookieStore with the request package
  
  
  this.cookieJar = jar;
  this.settingsCookieLastSaved = new Date();
  this.userAgent = this.parent.device.userAgent;

  // Verify that the jar contains a non-expired csrftoken for the API
  // domain. Instagram gives us a 1-year csrftoken whenever we log in.
  // If it's missing, we're definitely NOT logged in! But even if all of
  // these checks succeed, the cookie may still not be valid. It's just a
  // preliminary check to detect definitely-invalid session cookies!
  if (!this.getToken()) {
    this.parent.isLoggedIn = false;
  } else {
    this.parent.isLoggedIn = true;
  }
}

/**
  * Retrieve the CSRF token from the current cookie jar.
  *
  * Note that Instagram gives you a 1-year token expiration timestamp when
  * you log in. But if you log out, they set its timestamp to "0" which means
  * that the cookie is "expired" and invalid. We ignore token cookies if they
  * have been logged out, or if they have expired naturally.
  *
  * @return string|null The token if found and non-expired, otherwise NULL.
  */
Client.prototype.getToken = function () {
  let cookie = this.getCookie('csrftoken');
  return cookie;
}

Client.prototype.getCookie = function (key) {
  try {
    let jarObj = utils.cookieStringToJSON(this.cookieJar.getCookieString('https://www.instagram.com'));
    return jarObj[key];
  } catch (e) { return; }
}

Client.prototype.getCookieString = function () {
  return this.cookieJar.getCookieString('https://www.instagram.com');
}

Client.prototype.makeRequest = function (endpoint, data) {
  var self = this;
  self.useProxy = false;
  self.url = `${API_URL}/${endpoint || ""}`;
  self.data = data;
  if (!data) self.method = 'GET';
  else self.method = 'POST';
  self.tempHeaders = self.headers;
  self.followRedirects = false;
  self.send = function () {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (self.method === 'GET' && self.data) {
          self.url += '?' + utils.getQueryString(self.data);
        }
        var option = {
          url: self.url,
          method: self.method,
          headers: self.tempHeaders,
          jar: self.cookieJar,
          gzip: true,
          followAllRedirects: self.followRedirects
        }
        if (self.method === 'POST' && self.data) {
          option.body = utils.getQueryString(self.data);
        }
        //if (self.useProxy) option.proxy = this.proxyAddress;
        utils.requestWithErrorHandling(option, self.request, null, self.cookiepath).then(({ body, response }) => {
          var result;
          try {
            result = JSON.parse(body);
          } catch (e) {
            result = response;
          }
          setTimeout(() => {
            return resolve(result)
          }, 1000)
        })
      }, 1000)
    })
  }
  self.needsAuth = function () {
    self.needsAuth = true;
    return self;
  }
  self.addHeader = function (key, value) {
    if (value) self.tempHeaders[key] = value;
    return self;
  }
  self.setMethod = function (type) {
    self.method = type;
    return self;
  }
  self.addCookie = function (key, value) {
    var cookie = request.cookie(`${key}=${value}`);
    self.cookieJar.setCookie(cookie, 'https://www.instagram.com');
    return self;
  }
  self.setFollowRedirects = function (val) {
    self.followRedirects = val;
    return self;
  }
  self.setProxy = function (val) {
    self.useProxy = val;
    return self;
  }
  return self;
}

/**
* Helper which throws an error if not logged in.
*
* Remember to ALWAYS call this function at the top of any API request that
* requires the user to be logged in!
*
* @throws \InstagramAPI\Exception\LoginRequiredException
*/
Client.prototype.throwIfNotLoggedIn = function () {
  // Check the cached login state. May not reflect what will happen on the
  // server. But it's the best we can check without trying the actual request!
  if (!this.parent.isLoggedIn) {
    throw new Error('User not logged in. Please call login() and then try again.');
  }
}

Client.prototype.createAccount = function (email, password, name, username, proxy = true) {
  const tor_request = tor.request;
  const self = this;
  return new Promise((resolve, reject) => {
    spawn('killall', ['tor'])
    sleep(1);
    console.log('Starting tor client')
    const child = spawn('tor');
    child.stdout.on('data', (data) => {
      let dataString = data.toString();
      if (dataString.includes('100%')) {
        console.log('tor client initialized, getting IP first')
        sleep(1)
        tor_request.get('https://api.ipify.org', function (err, res, torIP) {
          if (!err && res.statusCode == 200) {
            publicIp.v4().then((ip) => {
              if (torIP !== ip) {
                console.log('Tor is working...Public IP hidden')
                let userdata = {
                  email: email,
                  password: password,
                  name: name || email.split('@')[0],
                  username: username || ''
                }
                let jar = request.jar();
                let options = {
                  jar: jar,
                  form: {
                    email: '',
                    password: '',
                    name: '',
                    username: ''
                  }
                }
                sleep(1)
                tor_request.get('https://instagram.com/', options, (err, response, body) => {
                  sleep(utils.randomIntFromInterval(1, 2))
                  let cookieString = jar.getCookieString('https://www.instagram.com');
                  let cookieObject = utils.cookieStringToJSON(cookieString);
                  let csrf = cookieObject['csrftoken'];
                  if (!csrf) return reject('Could not get csrf token');
                  options.headers = {
                    'Host': 'www.instagram.com',
                    'Accept': '*/*',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept-Language': 'en-us',
                    'X-Instagram-AJAX': '1',
                    'Origin': 'https://www.instagram.com',
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/604.1.38 (KHTML, like Gecko) Version/11.0 Safari/604.1.38',
                    'Referer': 'https://www.instagram.com/',
                    'X-CSRFToken': csrf
                  };
                  var formPostRequests = [];
                  for (var option in userdata) {
                    options.form[option] = userdata[option];
                    formPostRequests.push(postForm(options));
                  }

                  function postForm(optionsForForm) {
                    return new Promise((resovleForm, rejectForm) => {
                      tor_request.post('https://www.instagram.com/accounts/web_create_ajax/attempt/', optionsForForm, (err, response, body) => {
                        sleep(utils.randomIntFromInterval(1, 2))
                        let formattedResponse = response;
                        try {
                          formattedResponse = JSON.parse(body);
                          var numOfUsernameSuggestions = formattedResponse.username_suggestions.length
                          if (!options.form.username && formattedResponse.username_suggestions && numOfUsernameSuggestions > 0) {
                            options.form.username = formattedResponse.username_suggestions[utils.randomIntFromInterval(0, numOfUsernameSuggestions - 1)]
                            console.log('Got a username from suggestions as', options.form.username)
                          }
                          if (response.statusCode === 200 && formattedResponse.status == 'ok') resovleForm(formattedResponse)
                          else if (err) rejectForm(err);
                          else rejectForm(response.statusMessage);
                        } catch (e) { rejectForm(e) }
                      })
                    })
                  }

                  Promise.all(formPostRequests).then(() => {
                    if (!options.form.username) options.form.username = options.form.name;
                    let lastFormRequestWithUserName = postForm(options);
                    lastFormRequestWithUserName.then(() => {
                      console.log('form created')
                      tor_request.post('https://www.instagram.com/accounts/web_create_ajax/', options, (err, response, body) => {
                        sleep(utils.randomIntFromInterval(1, 2));
                        let formattedResponse = response;
                        let id;
                        try {
                          formattedResponse = JSON.parse(body);
                          console.log(formattedResponse);
                          if (formattedResponse.status === 'ok' && formattedResponse.account_created === true) id = formattedResponse.user_id;
                          else if (err) return reject(err);
                          else if (formattedResponse.error_type === 'signup_block') {
                            console.log('Bad IP trying again')
                            return self.createAccount(email, password, name, username)
                          }
                          else return reject(response.statusMessage);
                        } catch (e) { return reject(e) }
                        let newUsername = options.form.username
                        options.form = null;
                        tor_request.get('https://instagram.com/', options, (err, response, body) => {
                          console.log('Account created successfully, cleaning up..')
                          spawn('killall', ['tor'])
                          if (response.statusCode === 200) {
                            console.log(newUsername, email, password);
                            return resolve({
                              username: newUsername,
                              email: email,
                              password: password
                            });
                          }
                          else {
                            return reject(response.statusMessage);
                          }
                        })
                      })
                    })
                  }).catch(reject)
                })
              } else {
                console.log('We have the same email address...tor might not be working')
                return reject()
              }
            })
          } else if (err.message == 'Connection Timed Out') {
            console.log('We timed out...starting over')
            return self.createAccount(email, password, name, username)
          }
          else reject(err)
        });
      }
    });
  })
}


module.exports = Client;