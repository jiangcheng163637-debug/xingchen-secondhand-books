var cloud = require('../utils/cloud');
module.exports = {
  submitFeedback: function (data) { return cloud.call('moderation', 'submitFeedback', data); },
  reportBook: function (data) { return cloud.call('moderation', 'reportBook', data); }
};
