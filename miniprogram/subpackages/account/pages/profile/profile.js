var userService = require('../../../../services/user');
var errors = require('../../../../utils/error-map');
var universityData = require('../../data/universities-index');
var campusLoader = require('../../data/campus-loader');

var provinces = universityData.provinces || [];
var provinceOptions = provinces.map(function (item) { return { id:item.id, name:item.name }; });
var CUSTOM_CAMPUS_NAME = '其他校区（手动填写）';

function campusOptions(provinceId, schoolCode) {
  var source = campusLoader.get(provinceId, schoolCode) || [];
  var custom = null;
  var items = source.filter(function (item) {
    var isCustom = item.name === CUSTOM_CAMPUS_NAME || item.reference === false || /-custom$/.test(item.id || '');
    if (isCustom) custom = item;
    return !isCustom;
  });
  items.push(custom || { id:String(schoolCode) + '-custom', name:CUSTOM_CAMPUS_NAME, city:'', area:'', address:'', reference:false });
  return items;
}

function locateSchool(schoolId) {
  var target = String(schoolId || '');
  for (var provinceIndex=0; provinceIndex<provinces.length; provinceIndex+=1) {
    var schools = provinces[provinceIndex].schools || [];
    for (var schoolIndex=0; schoolIndex<schools.length; schoolIndex+=1) {
      if (String(schools[schoolIndex].code) === target) return { provinceIndex:provinceIndex, schoolIndex:schoolIndex };
    }
  }
  return { provinceIndex:0, schoolIndex:0 };
}

function initialSelection(user) {
  user = user || {};
  var savedSchool = user.school || {};
  var location = locateSchool(savedSchool.id || user.schoolId);
  var province = provinces[location.provinceIndex] || { id:'p01', name:'北京市', schools:[] };
  var schools = province.schools || [];
  var school = schools[location.schoolIndex] || schools[0] || { code:'', name:'', city:'' };
  var campuses = campusOptions(province.id, school.code);
  var savedCampusId = savedSchool.campusId || user.campusId || '';
  var savedCampusName = savedSchool.campusName || user.campusName || '';
  var campusIndex = campuses.findIndex(function (item) { return item.id === savedCampusId; });
  var manualCampusName = '';
  if (campusIndex < 0 && savedCampusName) {
    campusIndex = campuses.findIndex(function (item) { return item.name === savedCampusName && item.reference !== false; });
  }
  if (campusIndex < 0 && savedCampusName) {
    campusIndex = campuses.length - 1;
    manualCampusName = savedCampusName;
  }
  if (campusIndex < 0) campusIndex = 0;
  if (campuses[campusIndex] && campuses[campusIndex].reference === false && !manualCampusName && savedCampusName !== CUSTOM_CAMPUS_NAME) {
    manualCampusName = savedCampusName;
  }
  return {
    provinceIndex:location.provinceIndex,
    schoolIndex:location.schoolIndex,
    campusIndex:campusIndex,
    schools:schools,
    campuses:campuses,
    manualCampusName:manualCampusName,
    isManualCampus:campuses[campusIndex] ? campuses[campusIndex].reference === false : true
  };
}

Page({
  data:{
    user:{ nickname:'', avatar:'' },
    provinces:provinceOptions,
    schools:[],
    campuses:[],
    provinceIndex:0,
    schoolIndex:0,
    campusIndex:0,
    manualCampusName:'',
    isManualCampus:false,
    saving:false,
    loading:true,
    error:''
  },
  onLoad:function () { this.load(); },
  load:function () {
    var self=this;
    this.setData({loading:true,error:''});
    userService.getProfile().then(function (user) {
      var selection=initialSelection(user);
      self.setData({
        user:user,
        provinces:provinceOptions,
        schools:selection.schools,
        campuses:selection.campuses,
        provinceIndex:selection.provinceIndex,
        schoolIndex:selection.schoolIndex,
        campusIndex:selection.campusIndex,
        manualCampusName:selection.manualCampusName,
        isManualCampus:selection.isManualCampus,
        loading:false
      });
    }).catch(function (error) { self.setData({loading:false,error:errors.friendly(error)}); });
  },
  chooseAvatar:function (event) { this.setData({ 'user.avatar':event.detail.avatarUrl }); },
  nicknameInput:function (event) { this.setData({ 'user.nickname':event.detail.value }); },
  provinceChange:function (event) {
    var provinceIndex=Number(event.detail.value) || 0;
    var province=provinces[provinceIndex] || provinces[0];
    var schools=province && province.schools ? province.schools : [];
    var school=schools[0] || { code:'' };
    var campuses=campusOptions(province.id, school.code);
    this.setData({ provinceIndex:provinceIndex, schools:schools, schoolIndex:0, campuses:campuses, campusIndex:0, isManualCampus:campuses[0] ? campuses[0].reference === false : true, manualCampusName:'' });
  },
  schoolChange:function (event) {
    var schoolIndex=Number(event.detail.value) || 0;
    var province=provinces[this.data.provinceIndex] || provinces[0];
    var school=this.data.schools[schoolIndex] || this.data.schools[0] || { code:'' };
    var campuses=campusOptions(province.id, school.code);
    this.setData({ schoolIndex:schoolIndex, campuses:campuses, campusIndex:0, isManualCampus:campuses[0] ? campuses[0].reference === false : true, manualCampusName:'' });
  },
  campusChange:function (event) {
    var campusIndex=Number(event.detail.value) || 0;
    var campus=this.data.campuses[campusIndex];
    this.setData({ campusIndex:campusIndex, isManualCampus:campus ? campus.reference === false : true, manualCampusName:'' });
  },
  manualCampusInput:function (event) { this.setData({manualCampusName:event.detail.value}); },
  selectedSchool:function () {
    var province=provinces[this.data.provinceIndex] || provinces[0];
    var school=this.data.schools[this.data.schoolIndex] || (province.schools || [])[0];
    var campus=this.data.campuses[this.data.campusIndex];
    var campusName=campus && campus.reference !== false ? campus.name : String(this.data.manualCampusName || '').trim();
    if (!province || !school || !campus) return null;
    return {
      id:String(school.code),
      name:school.name,
      campusId:String(campus.id),
      campusName:campusName,
      provinceId:province.id,
      provinceName:province.name,
      city:school.city || campus.city || ''
    };
  },
  deleteAccount:function () {
    var self=this;
    wx.showModal({
      title:'确认注销账号？',
      content:'你的个人资料会被清除，在售书籍会被下架。此操作不可恢复。',
      confirmText:'确认注销',
      confirmColor:'#C85A5A',
      success:function (res) {
        if (!res.confirm || self.data.saving) return;
        self.setData({saving:true});
        userService.deleteAccount().then(function () {
          getApp().globalData.user=null;
          self.setData({saving:false});
          wx.showModal({title:'账号已注销',content:'个人资料已清除，在售书籍已下架。',showCancel:false,success:function(){wx.reLaunch({url:'/pages/index/index'});}});
        }).catch(function (error) { self.setData({saving:false}); wx.showToast({title:errors.friendly(error),icon:'none'}); });
      }
    });
  },
  save:function () {
    var self=this;
    var nickname=String(this.data.user.nickname || '').trim();
    var school=this.selectedSchool();
    if (!nickname) { wx.showToast({ title:'请填写昵称', icon:'none' }); return; }
    if (!school) { wx.showToast({ title:'请选择学校和校区', icon:'none' }); return; }
    if (this.data.isManualCampus && !school.campusName) { wx.showToast({ title:'请填写校区名称', icon:'none' }); return; }
    if (school.campusName.length > 40) { wx.showToast({ title:'校区名称最多40字', icon:'none' }); return; }
    if (this.data.saving) return;
    this.setData({ saving:true });
    userService.updateProfile({ nickname:nickname, avatar:this.data.user.avatar || '', school:school }).then(function (user) {
      var app=getApp();
      app.globalData.user=user;
      app.globalData.school=user.school || school;
      self.setData({ saving:false });
      wx.showToast({ title:'资料已保存', icon:'success' });
      setTimeout(function () { wx.navigateBack(); }, 500);
    }).catch(function (error) { self.setData({ saving:false }); wx.showToast({ title:errors.friendly(error), icon:'none' }); });
  }
});
