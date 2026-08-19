var constants=require('../../config/constants');
var validator=require('../../utils/validator');
var image=require('../../utils/image');
var cloud=require('../../utils/cloud');
var bookService=require('../../services/book');
var userService=require('../../services/user');
var storage=require('../../utils/storage');
var errors=require('../../utils/error-map');

function currentSchool(){return getApp().globalData.school || constants.schools[0];}
function blank(){return{images:[],title:'',author:'',publisher:'',isbn:'',originalPrice:'',salePrice:'',condition:constants.conditions[1],category:constants.categories[1],description:'',contactType:'wechat',contactValue:'',school:currentSchool(),privacyAccepted:false};}
Page({
 data:{form:blank(),conditions:constants.conditions,categories:constants.categories,publishCategories:constants.categories.slice(1),contactTypes:constants.contactTypes,submitting:false,draftFound:false,canAddImage:true},
 onLoad:function(){var draft=storage.get('draft',null);if(draft){var form=Object.assign(blank(),draft);if(!draft.school)form.school=currentSchool();this.setData({form:form,draftFound:true,canAddImage:form.images.length<9});}else{this.setData({'form.school':currentSchool()});}},
 onShow:function(){if(!this.data.draftFound&&!this.data.form.title)this.setData({'form.school':currentSchool()});},
 onUnload:function(){if(!this.published)storage.set('draft',this.data.form);},
 update:function(event){var key=event.currentTarget.dataset.key;var value=event.detail.value;var change={};change['form.'+key]=value;this.setData(change);this.saveDraft();},
 chooseImages:function(){var self=this;image.chooseImages(9-this.data.form.images.length).then(function(paths){var items=self.data.form.images.concat(paths).slice(0,9);self.setData({'form.images':items,canAddImage:items.length<9});self.saveDraft();}).catch(function(error){if(String(error.errMsg||'').indexOf('cancel')<0)wx.showToast({title:'图片选择失败',icon:'none'});});},
 removeImage:function(event){var items=this.data.form.images.slice();items.splice(event.currentTarget.dataset.index,1);this.setData({'form.images':items,canAddImage:true});this.saveDraft();},
 preview:function(event){image.preview(event.currentTarget.dataset.src,this.data.form.images);},
 scanIsbn:function(){var self=this;wx.scanCode({scanType:['barCode'],success:function(res){self.setData({'form.isbn':res.result});self.saveDraft();}});},
 conditionChange:function(event){this.setData({'form.condition':this.data.conditions[Number(event.detail.value)]});this.saveDraft();},
 categoryChange:function(event){this.setData({'form.category':this.data.categories[Number(event.detail.value)+1]||this.data.categories[1]});this.saveDraft();},
 contactChange:function(event){this.setData({'form.contactType':this.data.contactTypes[Number(event.detail.value)].value});this.saveDraft();},
 togglePrivacy:function(event){this.setData({'form.privacyAccepted':event.detail.value.length>0});this.saveDraft();},
 saveDraft:function(){storage.set('draft',this.data.form);},
 clearDraft:function(){var self=this;wx.showModal({title:'清空草稿？',content:'已填写的内容将无法恢复。',success:function(res){if(res.confirm){storage.remove('draft');self.setData({form:blank(),draftFound:false});}}});},
 submit:function(){var self=this;if(this.data.submitting)return;var message=validator.validateBook(this.data.form);if(message){wx.showToast({title:message,icon:'none'});return;}if(!this.data.form.privacyAccepted){wx.showToast({title:'请先阅读并同意发布说明',icon:'none'});return;}this.setData({submitting:true});userService.init().then(function(){return cloud.uploadFiles(self.data.form.images);}).then(function(paths){return bookService.publish(Object.assign({},self.data.form,{images:paths}));}).then(function(){self.published=true;storage.remove('draft');self.setData({submitting:false,form:blank(),draftFound:false});wx.switchTab({url:'/pages/index/index',success:function(){wx.showToast({title:'发布成功，已上架',icon:'success'});}});}).catch(function(error){self.setData({submitting:false});wx.showToast({title:errors.friendly(error),icon:'none'});});}
});
