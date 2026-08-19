var moderation = require('../../../../services/moderation');
var errors = require('../../../../utils/error-map');
Page({
  data:{ content:'', contact:'', submitting:false },
  input:function (event) { var key=event.currentTarget.dataset.key; var change={}; change[key]=event.detail.value; this.setData(change); },
  submit:function () {
    var self=this; var content=String(this.data.content || '').trim();
    if (content.length < 2) { wx.showToast({ title:'请具体说说你的建议', icon:'none' }); return; }
    if (this.data.submitting) return;
    this.setData({ submitting:true });
    moderation.submitFeedback({ content:content, contact:String(this.data.contact || '').trim() }).then(function () {
      self.setData({ submitting:false, content:'', contact:'' });
      wx.showModal({ title:'感谢你的反馈', content:'我们已经收到，会认真阅读。', showCancel:false, success:function () { wx.navigateBack(); } });
    }).catch(function (error) { self.setData({ submitting:false }); wx.showToast({ title:errors.friendly(error), icon:'none' }); });
  }
});
