Component({ properties:{ title:{type:String,value:'这里还没有内容'}, description:{type:String,value:''}, actionText:{type:String,value:''} }, methods:{ action:function(){this.triggerEvent('action');} } });
