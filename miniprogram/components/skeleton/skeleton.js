Component({
  properties:{
    count:{
      type:Number,
      value:4,
      observer:function (value) {
        var length=Math.max(1, Math.min(8, Number(value) || 4));
        var items=[];
        for (var index=0; index<length; index+=1) items.push(index);
        this.setData({items:items});
      }
    }
  },
  data:{items:[0,1,2,3]}
});
