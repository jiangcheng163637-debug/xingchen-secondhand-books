var cloud = require('../utils/cloud');
var bookService = require('./book');

function unwrapBooks(result) {
  var items = result.items || result;
  return (items || []).map(function (item) { return bookService.decorate(item.book || item); });
}

module.exports = {
  toggleFavorite:function (bookId) {
    return cloud.call('engagement', 'toggleFavorite', { bookId:bookId }).then(function (result) {
      return { active:result.active !== undefined ? result.active : result.favorited };
    });
  },
  favoriteList:function () { return cloud.call('engagement', 'favoriteList').then(unwrapBooks); },
  recordView:function (bookId) { return cloud.call('engagement', 'recordView', { bookId:bookId }); },
  history:function () { return cloud.call('engagement', 'historyList').then(unwrapBooks); },
  createIntent:function (bookId, sourceScene) { return cloud.call('engagement', 'createIntent', { bookId:bookId, sourceScene:sourceScene || 'detail' }); },
  getContact:function (bookId) { return cloud.call('engagement', 'getContact', { bookId:bookId }); }
};
