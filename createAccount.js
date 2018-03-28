var utils = require('./').utils;
utils.makeRandomAccount().then((api)=>{
  console.log(api);
})