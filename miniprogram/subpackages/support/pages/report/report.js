var moderation = require('../../../../services/moderation');
var errors = require('../../../../utils/error-map');
var reasons = ['疑似诈骗或要求提前转账', '违禁或不适宜内容', '商品信息虚假', '联系方式骚扰', '其他问题'];
Page({
  data:{ bookId:'', reasons:reasons, reasonIndex:0, detail:'', submitting:false },
  onLoad:function (options) { this.setData({ bookId:options.bookId || '' }); },
  reasonChange:function (event) { this.setData({ reasonIndex:Number(event.detail.value) }); },
  detailInput:function (event) { this.setData({ detail:event.detail.value }); },
  submit:function () {
    var self=this;
    if (!this.data.bookId) { wx.showToast({ title:'书籍信息无效', icon:'none' }); return; }
    if (this.data.submitting) return;
    var reason=this.data.reasons[this.data.reasonIndex];
    var detail=String(this.data.detail || '').trim();
    this.setData({ submitting:true });
    moderation.reportBook({ bookId:this.data.bookId, reason:detail ? reason + '：' + detail : reason, evidenceFileIds:[] }).then(function () {
      self.setData({ submitting:false });
      wx.showModal({ title:'举报已提交', content:'我们会尽快核查。感谢你一起维护校园书市。', showCancel:false, success:function () { wx.navigateBack(); } });
    }).catch(function (error) { self.setData({ submitting:false }); wx.showToast({ title:errors.friendly(error), icon:'none' }); });
  }
});
