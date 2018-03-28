const { randomIntFromInterval, randomWithProbability, dateToTimeStamp, normalize, nonBlockingSleep, shuffleObject, getCommentFromPost } = require('../utils');
const utils = require('../utils');
const fetchTypes = ['location', 'user', 'feed']
const DEFAULT_SAVE_DIRECTORY = 'instagramAPI/';
const path = require('path-extra');
const INSTAGRAM_START_DATE = '10-01-2010';
const moment = require('moment');
const ospath = require('ospath');
var merge = require('lodash.merge');

const LOW_ACCOUNT_STRENGTH = 3764642844;
const HIGH_ACCOUNT_STRENGTH = 9035142826;
const WEIGHTS_ADJUSTMENT = 1.2;
const MIN_WAIT_TIME_FOR_ACTION = 60;
const MAX_WAIT_TIME_FOR_ACTION = 120;
const MIN_WAIT_TIME_BETWEEN_ACTIONS = 120;
const MAX_WAIT_TIME_BETWEEN_ACTIONS = 360;
const MIN_UNFOLLOW_TIMEOUT = 60 * 10 * 1000;
const MAX_UNFOLLOW_TIMEOUT = 60 * 60 * 1000;
const MIN_FOLLOWER_UPDATE_TIMEOUT = 60 * 6 * 1000;
const MAX_FOLLOWER_UPDATE_TIMEOUT = 60 * 120 * 1000;
const MAX_TIME_WEIGHT_TO_DECIDE_IF_FOLLOWER = 60 * 30 * 1000;
const MAX_LIKE_COUNT = 500;
const MAX_FOLLOW_COUNT = 350;
const MAX_COMMENT_COUNT = 350;
const DAY_IN_MILLISECONDS = 8.64e+7;
const DAY_IN_SECONDS = 86400;

/**
 * follow: 350 / day
 * likes: 350 / day
 * comments: 250 / day 
 * Age of Instagram account
 * Size – Number of followers
 * Overall engagement (commenting, liking)
 * Active/inactive accounts
 */

function Bot(parent, proxy) {
  this.options = {};
  this.options.test = false;
  this.lastComment = '';
  this.on = true;
  this.api = parent;
  this.actionPath = [];
  this.botSettings = {};
  this.safeMode = false || this.options.safeMode;
  this.api.setProxyOption(proxy);
  this.setActionCounts();
  setInterval(() => {
    this.startUnFollowCycle();
  }, utils.randomIntFromInterval(MIN_UNFOLLOW_TIMEOUT, MAX_UNFOLLOW_TIMEOUT));
}

Bot.prototype = {}

Bot.prototype.getOptionsFromFirebase = async function () {
  return new Promise((resolve, reject) => {
    utils.listenForOptionUpdates(this.api.username, (snapshot) => {
      let { tags, values } = snapshot.val() || {};
      if (tags)
        this.options.tags = tags.split(',').map((tag) => tag.trim());
      else this.options.tags = [];
      values = values.split(' ');
      this.options.like = values[0];
      this.options.comment = values[1];
      this.options.follow = values[2];
      this.tagsToLike = this.options.tags.slice(0);
      this.locationsToLike = this.options.locations;
      resolve();
    });
  });
}

Bot.prototype.setActionCounts = async function () {
  this.likeCount = await this.get('likeCount') || 0;
  this.followCount = await this.get('followCount') || 0;
  this.commentCount = await this.get('commentCount') || 0;

  if (
    !this.likeCount ||
    !this.followCount ||
    !this.commentCount
  ) {
    await this.set('likeCount', { amount: 0, time: moment().format('x') });
    await this.set('followCount', { amount: 0, time: moment().format('x') });
    await this.set('commentCount', { amount: 0, time: moment().format('x') });
  }
}

Bot.prototype.get = async function (key) {
  let data = await utils.getBotSetting(this.api.username, key);
  return data;
}

Bot.prototype.set = async function (key, value) {
  await utils.setBotSetting(this.api.username, key, value);
}

Bot.prototype.getAccountParams = async function () {
  const lastUnfollowTime = await this.get('lastUnfollowTime')
  if (!lastUnfollowTime) {
    this.lastUnfollowTime = moment().format('x');
    await this.set('lastUnfollowTime', this.lastUnfollowTime)
  } else {
    this.lastUnfollowTime = lastUnfollowTime;
  }

  const lastFollowerUpdate = await this.get('lastFollowerUpdate')
  if (!lastFollowerUpdate) {
    this.lastFollowerUpdate = moment().format('x');
    await this.set('lastFollowerUpdate', this.lastFollowerUpdate)
  } else {
    this.lastFollowerUpdate = lastFollowerUpdate;
  }
}

Bot.prototype.getUserInfo = async function (username) {
  var self = this;
  let userObject = await this.api.getUserInfo(username);
  if (!userObject) return {};
  var followers = userObject.user.followed_by.count;
  var following = userObject.user.follows.count;
  var postsAmount = userObject.user.media.count;
  return { followers, following, postsAmount }
}

Bot.prototype.start = async function () {
  await this.getOptionsFromFirebase();
  await this.getAccountParams();
  console.log('starting bot')
  //gets posts, could be user feed, or location or tags
  while (this.on) {
    var posts = await this.getPosts();
    if (!posts || !posts.items) continue;
    while (!posts.items) {
      console.log('Couldnt get post...maybe trying too fast...going to wait')
      var sleepTime = randomIntFromInterval(MIN_WAIT_TIME_BETWEEN_ACTIONS * 3, MAX_WAIT_TIME_BETWEEN_ACTIONS * 5);
      console.log('sleeping for', sleepTime, 'seconds')
      if (!this.options.testing) await nonBlockingSleep(sleepTime)
      posts = await this.getPosts();
    }
    console.log('got posts successfully')
    var postsToPerformAction = this.reducePosts(posts);
    for (var post of postsToPerformAction) {
      this.updateFollowerList();
      let goodUser;
      let prob = {
        likeFromUser: 70,
        likeFromFeed: 30
      }
      var postID = post.id;
      var usernameID = post.owner.id;
      var username = await this.api.getUsernameFromPost(post)
      if (!username) continue;
      let chosenType = randomWithProbability(prob);

      if (chosenType === 'likeFromUser') {
        //Performing actions from user feed
        console.log('Performing actions on user feed')
        var userPosts = await this.api.getUserFeed(username);
        if (!userPosts || !userPosts.items) {
          console.log(console.trace(), 'something went wrong not able to get posts from user', username)
          continue;
        }
        let userPostReduced = this.reducePosts(userPosts, 10);
        let { postsAmount, followers, following } = await this.getUserInfo(username);
        if (!postsAmount || !followers || !following) continue;
        goodUser = utils.shouldActOnPost(following, followers, postsAmount)
        for (var userPost of userPostReduced) {
          if (!userPost) continue;
          console.log('Check post out at ' + `https://www.instagram.com/p/${userPost.code}/?`)
          if (goodUser) {
            await this.performAction(userPost, username, usernameID, true);
          } else {
            console.log('not performing action on this user')
            break;
          }
        }
      } else {
        //like single photo from feed
        console.log('Performing action from feed')
        console.log('Check post out at ' + `https://www.instagram.com/p/${post.shortcode || post.code}/?`)
        let { followers, following, postsAmount } = await this.getUserInfo(username);
        if (!postsAmount || !followers || !following) continue;
        goodUser = utils.shouldActOnPost(following, followers, postsAmount);
        if (goodUser) {
          await this.performAction(post, username, usernameID);
        }
        else {
          console.log('not performing action on this feed')
          continue;
        }
      }
      if (goodUser) {
        var sleepTime = randomIntFromInterval(MIN_WAIT_TIME_BETWEEN_ACTIONS, MAX_WAIT_TIME_BETWEEN_ACTIONS);
        console.log('sleeping for', sleepTime, 'seconds')
        if (!this.options.testing) await nonBlockingSleep(sleepTime)
      }
    }
  }
}

Bot.prototype.reducePosts = function (posts, most) {
  most = most || posts.items.length;
  var postsToPerformAction = [];
  var amountToLike = 0;
  //getting amount to like
  while (!amountToLike)
    amountToLike = randomIntFromInterval(0, most);
  for (var i = 0; postsToPerformAction.length < amountToLike; i++) {
    if (randomIntFromInterval(0, 1))
      postsToPerformAction.push(posts.items[i]);
    else i -= 1;
  }
  console.log('Got', amountToLike, 'posts to act on')
  return postsToPerformAction;
}

Bot.prototype.startUnFollowCycle = async function () {
  if (await this.countTooHigh('follow')) {
    console.log('Unfollowing too fast please wait');
    return;
  }
  let usernameID = await utils.getUnfollowUserFromFirebase(this.api.username)
  if (usernameID) {
    this.api.unfollow(usernameID)
    console.log('Unfollowed user ' + usernameID)
    await this.addActionAmount('followCount');
  }
}

Bot.prototype.getPosts = function () {
  return new Promise((resolve, reject) => {
    let prob = {
      location: 0,
      feed: 100
    }
    let chosenType = randomWithProbability(prob);
    if (chosenType == 'location') {
      // let locations = this.options.locations;
      // let location = locations[randomIntFromInterval(0, locations.length - 1)]
      // this.removeOldValueFromLocations(location);
      // console.log('Getting posts for location', location)
      //this.api.getLocationFeed(location).then(resolve)
    } else if (chosenType == 'feed') {
      let tag = this.tagsToLike[randomIntFromInterval(0, this.tagsToLike.length - 1)]
      if (tag) {
        this.removeOldValueFromTags(tag);
        console.log('Getting posts for tag', tag)
        this.api.getHashtagFeed(tag).then(resolve)
      } else resolve({ items: {} })
    }
  })
}

Bot.prototype.removeOldValueFromTags = function (value) {
  let index = this.tagsToLike.indexOf(value);
  if (index !== -1) this.tagsToLike.splice(index, 1);
  if (this.tagsToLike.length === 0) this.tagsToLike = this.options.tags.slice(0);
}

Bot.prototype.removeOldValueFromLocations = function (value) {
  let index = this.locationsToLike.indexOf(value);
  if (index !== -1) this.locationsToLike.splice(index, 1);
  if (this.locationsToLike.length === 0) this.locationsToLike = this.options.locations.splice(0);
}

Bot.prototype.isUserFollowing = async function (username) {
  let followerObject = await this.api.getUserFollowStatus(username);
  let { follows_viewer, followed_by_viewer } = followerObject && followerObject.user ? followerObject.user : {};
  return { isFollowing: follows_viewer, isFollower: followed_by_viewer };
}

Bot.prototype.performAction = async function (post, username, usernameId, fastMode = false) {
  //fast mode is for user feed posts
  var postID = post.id;
  let { isFollowing, isFollower } = await this.isUserFollowing(username);
  this.actionPath = [];
  /**
   * These params will not go above max for instagram limits.
   * Example params:
   * like: 95%
   * comment: 50%
   * follow: 20%
   * Percentage can vary based on account params
   */
  //TODO: account for account strength
  var probs = utils.getProbsFromOptions(this.options, isFollowing, isFollower);
  var actionsShuffled = shuffleObject(probs) || {};
  let hasAtLeastOneAction = false;
  let clean;
  if (!actionsShuffled) console.log(console.trace(), 'actionsShuffled does not exist, there was a problem');
  for (var probKey in actionsShuffled) {
    let chosenType = randomWithProbability(actionsShuffled[probKey]);
    switch (chosenType) {
      case 'like':
        clean = await utils.postIsClean(`https://www.instagram.com/p/${post.shortcode || post.code}/`, this.safeMode);
        if (await this.countTooHigh('like') || !clean) {
          this.actionPath.push({ 'like': false });
          break;
        }
        hasAtLeastOneAction = true;
        await this.like(postID, post.shortcode || post.code, username);
        await utils.postActionToDatabaseFeed(this.api.username, 'likes', post, moment().format('x'));
        await this.addActionAmount('likeCount');
        this.actionPath.push({ 'like': true });
        break
      case 'comment':
        clean = await utils.postIsClean(`https://www.instagram.com/p/${post.shortcode || post.code}/`, this.safeMode);
        if (await this.countTooHigh('comment') || !clean) {
          this.actionPath.push({ 'comment': false });
          break
        }
        let hasCommented = await this.hasCommentedOnPost(post, this.api.username);
        if (hasCommented) {
          console.log('Already commented on post skipping');
          break;
        }
        hasAtLeastOneAction = true;
        let commentText = await utils.getCommentFromDataBase(post);
        if (commentText === this.lastComment) {
          console.log('Got same comment text as before skipping comment');
          break;
        }
        this.lastComment = commentText;
        await this.comment(post, post.shortcode || post.code, username, commentText);
        await utils.postActionToDatabaseFeed(this.api.username, 'comments', post, moment().format('x'));
        await this.addActionAmount('commentCount');
        this.actionPath.push({ 'comment': commentText })
        break
      case 'follow':
        clean = await utils.postIsClean(`https://www.instagram.com/p/${post.shortcode || post.code}/`, this.safeMode);
        if (await this.countTooHigh('follow') || !clean) {
          this.actionPath.push({ 'follow': false });
          break;
        }
        const { isFollower } = await this.isUserFollowing(username);
        if (isFollower) {
          console.log('Already following account, skipping');
          break;
        }
        hasAtLeastOneAction = true;
        await this.follow(usernameId, username);
        await utils.postActionToDatabaseFeed(this.api.username, 'follows', post, moment().format('x'));
        await this.addActionAmount('followCount');
        this.actionPath.push({ 'follow': true });
        break
      case 'notLike':
        this.actionPath.push({ 'like': false });
        break;
      case 'notComment':
        this.actionPath.push({ 'comment': false });
        break;
      case 'notFollow':
        this.actionPath.push({ 'follow': false });
        break;
    }
    console.log(chosenType, 'action completed')
    var sleepTime = randomIntFromInterval(MIN_WAIT_TIME_FOR_ACTION, MAX_WAIT_TIME_FOR_ACTION);
    if (fastMode) sleepTime = randomIntFromInterval(5, 10)
    console.log('sleeping for', sleepTime, 'seconds')
    if (!this.options.testing) await nonBlockingSleep(sleepTime)
  }
  if (hasAtLeastOneAction) await this.saveActionPath(post, usernameId);
}

Bot.prototype.addActionAmount = async function (key) {
  let actionAmount = await this.get(key);
  actionAmount.amount = actionAmount.amount + 1
  await this.set(key, actionAmount)
}

Bot.prototype.countTooHigh = async function (type) {
  if (type === 'like') {
    let actionAmount = await this.get('likeCount');
    if (actionAmount.amount < MAX_LIKE_COUNT) return false;
    else if (moment().diff(parseInt(actionAmount.time), 'days') >= 1) {
      await this.set('likeCount', { amount: 0, time: moment().format('x') })
      console.log('You only liked', actionAmount.amount, 'but one day has passed so resetting')
      return false
    } else {
      console.log('Action blocked you are liking too many...maybe slow down?')
      return Math.abs(DAY_IN_SECONDS - moment().diff(parseInt(actionAmount.time), 'seconds'));
    }
  }
  else if (type === 'follow') {
    let actionAmount = await this.get('followCount');
    if (actionAmount.amount < MAX_FOLLOW_COUNT) return false;
    else if (moment().diff(parseInt(actionAmount.time), 'days') >= 1) {
      await this.set('followCount', { amount: 0, time: moment().format('x') })
      console.log('You only followed', actionAmount.amount, 'but one day has passed so resetting')
      return false;
    } else {
      console.log('Action blocked you are following too many...maybe slow down?')
      return Math.abs(DAY_IN_SECONDS - moment().diff(parseInt(actionAmount.time), 'seconds'));
    }
  }
  else if (type === 'comment') {
    let actionAmount = await this.get('commentCount');
    if (actionAmount.amount < MAX_COMMENT_COUNT) return false;
    else if (moment().diff(parseInt(actionAmount.time), 'days') >= 1) {
      await this.set('commentCount', { amount: 0, time: moment().format('x') })
      console.log('You only commented', actionAmount.amount, 'but one day has passed so resetting')
      return false
    } else {
      console.log('Action blocked you are commenting too many...maybe slow down?')
      return Math.abs(DAY_IN_SECONDS - moment().diff(parseInt(actionAmount.time), 'seconds'));
    }
  }

}

Bot.prototype.updateFollowerList = async function () {
  if (this.updatingFollowerList) return;
  this.updatingFollowerList = true;
  let randFollowerUpdateTimeout = randomIntFromInterval(MIN_FOLLOWER_UPDATE_TIMEOUT, MAX_FOLLOWER_UPDATE_TIMEOUT);
  if (moment().diff(parseInt(this.lastFollowerUpdate), 'ms') > randFollowerUpdateTimeout) {
    console.log('More than', moment.utc(randFollowerUpdateTimeout).format("HH:mm:ss.SSS"), 'has elpased updating follower list')
    let followerList = await this.api.getAllUserFollowers(this.api.username);
    followerList = followerList.map((followerObject) => {
      return followerObject.id;
    })
    var followerListFromFirebase = await utils.getFollowerListFromFirebase(this.api.username) || {}
    for (var follower of followerList) {
      //Change all followers in FS to real-time status
      followerListFromFirebase[follower] = { status: 'following', time: moment().format('x') };
    }
    for (var follower in followerListFromFirebase) {
      //Updating the people who we follow..If more than elpased time
      //then distingush them as a non-follower...
      if (!followerList.indexOf(parseInt(follower)) > -1) {
        if (moment().diff(parseInt(followerListFromFirebase[follower].time)) > MAX_TIME_WEIGHT_TO_DECIDE_IF_FOLLOWER && followerListFromFirebase[follower].status === 'pending') {
          followerListFromFirebase[follower] = { status: 'not', time: moment().format('x') };
        }
      }
    }
    await utils.setFollowerListInFirebase(this.api.username, followerListFromFirebase);
    this.lastFollowerUpdate = moment().format('x');
    await this.set('lastFollowerUpdate', this.lastFollowerUpdate)
  }
  this.updatingFollowerList = false;
}


Bot.prototype.saveActionPath = async function (post, usernameId) {
  let action = {
    timestamp: moment().format('x'),
    action: this.actionPath,
    tags: this.options.tags,
    user: usernameId
  }
  console.log('Saving data base entry, and pending follower')
  await this.saveFollowerDataAsPending(usernameId);
  //await utils.postActionToFirebase(this.api.username, action);
}

Bot.prototype.saveFollowerDataAsPending = async function (usernameId) {
  let data = { status: 'pending', time: moment().format('x') };
  await utils.updateFollowerFromFirebase(this.api.username, usernameId, data);
}

Bot.prototype.like = async function (postID, postCode, username) {
  console.log('liking post', postID)
  if (this.options.testing) return;
  return await this.api.like(postID, postCode, username);
}

Bot.prototype.hasCommentedOnPost = async function (post, username) {
  var postAsJSON = await this.api.getPostAsJSON(post.shortcode || post.code);
  var comments = postAsJSON && postAsJSON.graphql && postAsJSON.graphql.shortcode_media &&
    postAsJSON.graphql.shortcode_media.edge_media_to_comment ? postAsJSON.graphql.shortcode_media.edge_media_to_comment.edges
    : [];
  let commentsNames = comments.map((comment) => { return comment && comment.node && comment.node.owner.username ? comment.node.owner.username : '' });
  let index = commentsNames.indexOf(username);
  return index !== -1;
}

Bot.prototype.comment = async function (post, postCode, username, commentText) {
  let postID = post.id;
  console.log('commented', commentText);
  if (commentText) {
    try {
      if (this.options.testing) return commentText;
      await this.api.comment(postID, postCode, commentText, username);
    } catch (e) {
      console.log('tried to comment but something broke', e)
    }
  }
  return commentText;
}

Bot.prototype.follow = async function (usernameId, username) {
  if (this.options.testing) return;
  await utils.addToUnfollowList(this.api.username, usernameId);
  try {
    return await this.api.follow(usernameId, username);
  } catch (e) {
    console.log('tried to follow but something went wrong', e)
  }
}


Bot.prototype.unfollowNonFollowers = async function () {
  while (true) {
    let { following, end_cursor, timestamp, usernameId } = await this.get('allUserFollowing') || {};
    if (!following || !end_cursor || !usernameId) {
      let followObject = await this.api.getAllUserFollowing(this.api.username, usernameId, end_cursor);
      following = followObject.following;
      if (following.length === 0) {
        console.log('No more followers to get, bot is done')
        return;
      }
      end_cursor = followObject.end_cursor;
      usernameId = followObject.usernameId;
      following = following.map((ele) => { return ele.username })
    }
    await this.set('allUserFollowing', { usernameId, following, end_cursor, timestamp: moment().format('x') });
    console.log('Got', following.length, 'users to unfollow')
    while (following.length) {
      let username = following[randomIntFromInterval(0, following.length - 1)]
      var { isFollower } = await this.isUserFollowing(username) || {};
      let followSleepTime = await this.countTooHigh('follow');
      if (!isFollower) {
        console.log('unfollowing user', username)
        if (followSleepTime) {
          console.log('sleeping for', followSleepTime, 'secs')
          if (!this.options.testing) await nonBlockingSleep(followSleepTime);
        }
        try {
          let usernameId = await this.api.getUserId(username)
          if (usernameId) await this.api.unfollow(usernameId, username)
          else continue;
        } catch (e) {
          console.log('Tried to unfollow but something went wrong', e)
        }
        console.log('successfully unfollowed', username)
        await this.addActionAmount('followCount');
        following = following.filter((ele) => { return ele !== username })
        await this.set('allUserFollowing', { usernameId, following, end_cursor, timestamp: moment().format('x') });
        let sleepTime = randomIntFromInterval(40, 180);
        console.log('sleeping for', sleepTime, 'secs')
        if (!this.options.testing) await nonBlockingSleep(sleepTime)
      }
    }
  }
}



/**
 * FOLLOW - NUM
 * LIKE - NUM
 * COMMENT - NUM
 * TAGS - STRING
 * LOCATION - STRING
 * 
 * 
 * NORMAL:
 * - GET POSTS BY TAGS/LOCATION - RANDOM CHOICE
 * - CHOOSE TO CONTINUE ON LATESTS POST OR RANDOM USERS FEED
 * - LIKE RANDOM AMOUNT OF POSTS
 * - COMMENT ON CERTAIN POSTS
 * - FOLLOW CERTAIN POSTS 
 *  - WANT TO FOLLOW THE LEAST AMOUNT OF PEOPLE AS POSSIBLE
 * 
 * 
 * 
 * 
 * EVERY NEW FOLLOWER IS THE RESULT OF A PATH
 * EX. 
 * LIKE 2 PICS, COMMENT ON TWO POSTS, FOLLOW,
 * FOLLOW, LIKE 5 PICTURES, COMMENT SIMPLY
 * LIKE LAST TEN PICTURES, FOLLOW, COMMENT COMPLEXLY ON 5 POSTS
 * 
 * 
 * 
 * 
 * EACH CLASS HAS RANDOM ATTRIBUTES:
 * LIKE - HIGH, LOW, MED, OR NONE
 * COMMENT - STATEMENT, QUESTION, SHORT, LONG OR NONE
 * FOLLOW - HOW LONG TO FOLLOW - LOW HIGH MEDIM OR NONE
 * 
 * CHOOSING ONE FROM EACH IN A SEQUENCE RESULTS IN THE CORRSPONDING USERS REACTION
 */


module.exports = Bot;