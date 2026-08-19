function chooseImages(count) {
  var limit = Math.max(0, Math.min(9, count || 9));
  if (!limit) return Promise.resolve([]);
  if (wx.chooseMedia) {
    return new Promise(function (resolve, reject) {
      wx.chooseMedia({
        count: limit,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed'],
        success: function (res) {
          resolve((res.tempFiles || []).map(function (item) { return item.tempFilePath; }));
        },
        fail: reject
      });
    });
  }
  return new Promise(function (resolve, reject) {
    wx.chooseImage({
      count: limit,
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: function (res) { resolve(res.tempFilePaths || []); },
      fail: reject
    });
  });
}

function preview(current, urls) {
  wx.previewImage({ current: current, urls: urls });
}

module.exports = { chooseImages: chooseImages, preview: preview };
