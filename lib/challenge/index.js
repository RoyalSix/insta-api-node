// iPhone probably works best, even from android previosly done request
var iPhoneUserAgent = 'Instagram 10.28.0 (iPhone6,1; iPhone OS 9_3_1; en_US; en; scale=2.00; gamut=normal; 640x1136) AppleWebKit/420+'
var iPhoneUserAgentHtml = 'Mozilla/5.0 (iPhone; CPU iPhone OS 9_3_1 like Mac OS X) AppleWebKit/601.1.46 (KHTML, like Gecko) Mobile/13E238 Instagram 10.28.0 (iPhone6,1; iPhone OS 9_3_1; en_US; en; scale=2.00; gamut=normal; 640x1136)'

var EMAIL_FIELD_REGEXP = /email.*value(.*)"/i;
var PHONE_FIELD_REGEXP = /sms.*value(.*)"/i;
var PHONE_ENTERED_FIELD_REGEXP = /tel.*value="(\+\d+)"/i
var RESET_FIELD_REGEXP = /reset_progress_form.*action="\/(.*)"/i
var SHARED_JSON_REGEXP = /window._sharedData = (.*);<\/script>/i

function Challenge(parent) {
  this.parent = parent
  // this._json = json;
  // this._session = session;
  // this._type = type;
  // this._error = error;
}

Challenge.prototype = {}
//WARNING: This is NOT backward compatible code since most methods are not needed anymore. But you are free to make it backward compatible :)
//How does it works now?
//Well, we have two ways of resolving challange. Native and html versions.
//First of all we reset the challenge. Just to make sure we start from beginning;
//After if we check if we can use native api version. If not - using html;
//Selecting method and sending code is diffenent, depending on native or html style.
//As soon as we got the code we can confirm it using Native version.
//Oh, and code confirm is same now for email and phone checkpoints
Challenge.prototype.resolve = function (checkpointError, defaultMethod, skipResetStep) {
  var that = this;
  if (typeof defaultMethod === 'undefined') defaultMethod = 'email';
  var session = checkpointError.session;
  checkpointError.url = checkpointError.url.replace('instagram.com/challenge/', 'instagram.com/api/v1/challenge/');

  return new Promise(function (res, rej) {
    if (skipResetStep) return res();
    return res(that.reset(checkpointError))
  })
    .then(function () {
      return this.parent.client.callApi(checkpointError.url)
        .then(function (json) {
          //Using html unlock if native is not supported
          if (json.challenge && json.challenge.native_flow === false) return that.resolveHtml(checkpointError, defaultMethod)
          //Challenge is not required
          if (json.status === 'ok' && json.action === 'close') return reject('NoChallengeRequired');

          //Using API-version of challenge
          switch (json.step_name) {
            case 'select_verify_method': {
              return this.parent.client.callApi(checkpointError.url, { "choice": defaultMethod === 'email' ? 1 : 0 })
                .then(() => {
                  return that.resolve(checkpointError, defaultMethod, true)
                })
            }
            case 'verify_code':
            case 'submit_phone': {
              return new PhoneVerificationChallenge(session, 'phone', checkpointError, json);
            }
            case 'verify_email': {
              return new EmailVerificationChallenge(session, 'email', checkpointError, json);
            }
            default: return new NotImplementedChallenge(session, json.step_name, checkpointError, json);
          }
        })
    })
}

Challenge.prototype.resolveHtml = function (checkpointError, defaultMethod) {
  //Using html version
  var that = this;
  if (!(checkpointError instanceof Exceptions.CheckpointError)) throw new Error("`Challenge.resolve` method must get exception (type of `CheckpointError`) as a first argument");
  if (['email', 'phone'].indexOf(defaultMethod) == -1) throw new Error('Invalid default method');
  var session = checkpointError.session;
  checkpointError.url = checkpointError.url.replace('instagram.com/api/v1/challenge/', 'instagram.com/challenge/');

  return new WebRequest(session)
    .setMethod('GET')
    .setUrl(checkpointError.url)
    .setHeaders({
      'User-Agent': iPhoneUserAgentHtml,
      'Referer': checkpointError.url,
    })
    .send({ followRedirect: true })
    .catch(errors.StatusCodeError, function (error) {
      return error.response;
    })
    .then(parseResponse)

  function parseResponse(response) {
    try {
      var json, challenge, choice;
      if (response.headers['Content-Type'] === 'application/json') {
        json = JSON.parse(response.body);
        challenge = json;
      } else {
        json = JSON.parse(SHARED_JSON_REGEXP.exec(response.body)[1]);
        challenge = json.entry_data.Challenge[0];
      }
    } catch (e) {
      throw new TypeError('Invalid response. JSON expected');
    }
    if (defaultMethod == 'email') {
      choice = challenge.fields.email ? 1 : 0
    } else if (defaultMethod == 'phone') {
      choice = challenge.fields.phone_number ? 0 : 1
    }

    switch (challenge.challengeType) {
      case 'SelectVerificationMethodForm': {
        return new WebRequest(session)
          .setMethod('POST')
          .setUrl(checkpointError.url)
          .setHeaders({
            'User-Agent': iPhoneUserAgentHtml,
            'Referer': checkpointError.url,
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Instagram-AJAX': 1
          })
          .setData({
            "choice": choice
          })
          .send({ followRedirect: true })
          .then(function () {
            return that.resolveHtml(checkpointError, defaultMethod)
          })
      }
      case 'VerifyEmailCodeForm': {
        return new EmailVerificationChallenge(session, 'email', checkpointError, json);
      }
      case 'VerifySMSCodeForm': {
        return new PhoneVerificationChallenge(session, 'phone', checkpointError, json);
      }
      default: return new NotImplementedChallenge(session, challenge.challengeType, checkpointError, json);
    }
  }
}
Challenge.prototype.reset = function (checkpointError) {
  var that = this;

  var session = checkpointError.session;
  var resetUrl = checkpointError.url.replace('instagram.com/api/v1/challenge/', 'instagram.com/challenge/reset/');
  return this.parent.client.callApi(resetUrl, data)
}
Challenge.prototype.code = function (code) {
  var that = this;
  if (!code || code.length != 6) throw new Error('Invalid code provided');
  return new WebRequest(that.session)
    .setMethod('POST')
    .setUrl(that.error.url)
    .setHeaders({
      'User-Agent': iPhoneUserAgent,
      'Referer': that.error.url,
    })
    .setBodyType('form')
    .setData({
      "security_code": code
    })
    .removeHeader('x-csrftoken')
    .send({ followRedirect: false })
    .then(function (response) {
      try {
        var json = JSON.parse(response.body);
      } catch (e) {
        throw new TypeError('Invalid response. JSON expected');
      }
      if (response.statusCode == 200 && json.status === 'ok' && (json.action === 'close' || json.location === 'instagram://checkpoint/dismiss')) return true;
      throw new Exceptions.NotPossibleToResolveChallenge('Unknown error', Exceptions.NotPossibleToResolveChallenge.CODE.UNKNOWN)
    })
    .catch(errors.StatusCodeError, function (error) {
      if (error.statusCode == 400) throw new Exceptions.NotPossibleToResolveChallenge("Verification has not been accepted", Exceptions.NotPossibleToResolveChallenge.CODE.NOT_ACCEPTED);
      throw error;
    })
}


module.exports = Challenge;

var PhoneVerificationChallenge = function (session, type, checkpointError, json) {
  this.submitPhone = json.step_name === 'submit_phone';
  Challenge.apply(this, arguments);
}
//Confirming phone number.
//We need to return PhoneVerificationChallenge that can be able to request code.
//So, if we need to submit phone number first - let's do it. If not - just return current PhoneVerificationChallenge;
PhoneVerificationChallenge.prototype.phone = function (phone) {
  var that = this;
  if (!this.submitPhone) return this;
  var _phone = phone || (that.json && that.json.step_data) ? that.json.step_data.phone_number : null;
  if (!_phone) return new Error('Invalid phone number');
  return new WebRequest(that.session)
    .setMethod('POST')
    .setUrl(that.error.url)
    .setHeaders({
      'User-Agent': iPhoneUserAgent,
      'Referer': that.error.url,
    })
    .setBodyType('form')
    .setData({
      "phone_number": _phone
    })
    .removeHeader('x-csrftoken')
    .send({ followRedirect: false })
    .then(function (response) {
      try {
        var json = JSON.parse(response.body);
      } catch (e) {
        throw new TypeError('Invalid response. JSON expected');
      }
      return new PhoneVerificationChallenge(that.session, 'phone', that.error, json);
    })
}

exports.PhoneVerificationChallenge = PhoneVerificationChallenge;

var EmailVerificationChallenge = function (session, type, checkpointError, json) {
  Challenge.apply(this, arguments);
}

exports.EmailVerificationChallenge = EmailVerificationChallenge;
