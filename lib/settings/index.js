const { PERSISTENT_KEYS } = require('../../static/constants');
const { base64_decode, keepOldCookies, cookieJSONToString, cookieStringToJSON } = require('../utils');
const ospath = require('ospath');
const path = require('path-extra');
const DEFAULT_SAVE_DIRECTORY = 'instagramAPI/';
const utils = require('../utils');
const fs = require('fs-extra');

function Settings(parent) {
  this.parent = parent;
};

Settings.prototype = {};


/**
 * Load all settings for a user from the storage and mark as current user.
 *
 * @param string username The Instagram username.
 *
 * @throws \InstagramAPI\Exception\SettingsException
 */
Settings.prototype.setActiveUser = function (username) {
  // If that user is already loaded, there's no need to do anything.
  if (username === this.username) {
    return;
  }

  // Set the new user as the current user for this storage instance.
  this.username = username;
  this.userFolder = this.generateUserPath(username);
}

Settings.prototype.generateUserPath = function (username) {
  let homePath = ospath.home();
  let userPath = path.join(homePath, DEFAULT_SAVE_DIRECTORY, 'users', username);
  fs.ensureDirSync(userPath)
  return userPath;
}

Settings.prototype.get = async function (key) {
  let data = await utils.getInstagramSetting(this.username, key);
  return data;
}

Settings.prototype.set = async function (key, value) {
  await utils.setInstagramSetting(this.username, key, value);
}

/**
* Erase all device-specific settings.
*
* This is useful when assigning a new Android device to the account, upon
* which it's very important that we erase all previous, device-specific
* settings so that our account still looks natural to Instagram.
*
* Note that cookies will NOT be erased, since that action isn't supported
* by all storage backends. Ignoring old cookies is the job of the caller!
*
* @throws \InstagramAPI\Exception\SettingsException
*/
Settings.prototype.eraseDeviceSettings = function () {
  PERSISTENT_KEYS.forEach((key) => {
    if (this[key]) this[key] = null;
  })
}

/**
 * Return saved experiments.
 *
 * @throws \InstagramAPI\Exception\SettingsException
 *
 * @return array
 */
Settings.prototype.getExperiments = async function () {
  let experiments = await this.get('experiments');
  if (!experiments || !experiments.length) {
    return [];
  }
  let format = experiments[0];
  experiments = experiments.slice(1);
  return experiments;
}

/**
 * Does a preliminary guess about whether the current user is logged in.
 *
 * Can only be executed after setActiveUser(). And the session it looks
 * for may be expired, so there's no guarantee that we are still logged in.
 *
 * @throws \InstagramAPI\Exception\SettingsException
 *
 * @return bool TRUE if possibly logged in, otherwise FALSE.
 */
Settings.prototype.isMaybeLoggedIn = async function () {
  this.throwIfNoActiveUser();

  return await this.hasUserCookies();
}

Settings.prototype.hasUserCookies = async function () {
  return !!this.parent.client.cookieJar;
}

/**
* Internal: Ensures that there is an active storage user.
*
* @throws \InstagramAPI\Exception\SettingsException
*/
Settings.prototype.throwIfNoActiveUser = function () {
  if (!this.username) {
    throw Error(
      'Called user-related function before setting the current storage user.'
    );
  }
}



module.exports = Settings;