'use strict';
const utf8 = require('utf8');
const crypto = require('crypto');
const { generateUUID } = require('../utils.js');

function User(username, password) {
  this.username = username;
  this.password = password;
  const digest = crypto.createHash('md5')
    .update(utf8.encode(username) + utf8.encode(password))
    .digest('hex');
  this.device_id = this.generateDeviceId(digest);
  this.isLoggedIn = false;
  this.ad_id = this.generate_adid();
}

User.prototype = {};

User.prototype.get = function (key) {
  return this[key];
}

User.prototype.set = function (key, value) {
  this[key] = value;
}

User.prototype.generateDeviceId = function () {
  const seed = crypto.createHash('md5')
  .update(utf8.encode(this.username) + utf8.encode(this.password))
  .digest('hex');
  var volatile_seed = "12345"
  const digest = crypto.createHash('md5')
    .update(utf8.encode(seed) + utf8.encode(volatile_seed))
    .digest('hex');
  return 'android-' + digest.substr(0, 16);
}

User.prototype.generate_adid = function (seed) {

  let sha;
  let modified_seed = seed || this.username;
  if (modified_seed) {
    //# Do some trivial mangling of original seed
    sha = crypto.createHash('sha256')
      .update(modified_seed, 'utf8')
      .digest('hex');
  }
  return generateUUID(false, sha)
}

module.exports = User;