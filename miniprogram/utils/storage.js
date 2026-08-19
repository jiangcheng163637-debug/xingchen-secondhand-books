var keys = {
  favorites:'xc_favorites', history:'xc_history', search:'xc_search_history',
  draft:'xc_publish_draft', books:'xc_local_books', contacts:'xc_private_contacts',
  user:'xc_user', feedback:'xc_feedback', reports:'xc_reports', intentions:'xc_intentions'
};
function get(key, fallback) {
  try {
    var value = wx.getStorageSync(keys[key] || key);
    return value === '' || value === undefined || value === null ? fallback : value;
  } catch (e) { return fallback; }
}
function set(key, value) { wx.setStorageSync(keys[key] || key, value); return value; }
function remove(key) { wx.removeStorageSync(keys[key] || key); }
module.exports = { keys: keys, get: get, set: set, remove: remove };
