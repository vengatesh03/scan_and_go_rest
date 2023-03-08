var express   = require('express'),
    router    = express.Router(),
    bodyParser= require('body-parser'),
    VerifyToken = require(__root +__core+'modules/VerifyToken');  

router.use(bodyParser.json());
var OperatorSetting = __db_model.OperatorSetting,
	Subscription = __db_model.Subscription,
	SubscriptionBundle          = __db_model.SubscriptionBundle,
	ActiveLogin                 = __db_model.ActiveLogin;

router.get('/',VerifyToken, function (req, res) {
	var current_date = new Date()
	OperatorSetting.findOne({raw:true,where:{org_id:req.orgId}}).then(function(oper){
		if(oper){
			oper.moq_slab_list = oper.moq_slab_list
			if(oper.moq_slab_list && oper.moq_slab_list.length > 0) {
				loop1:
				for (var i = 0; i < (oper.moq_slab_list).length; i++){
					var data = oper.moq_slab_list[i];
					if((current_date.getTime() >= (new Date(data.start_date)).getTime()) && (current_date.getTime() <= (new Date(data.end_date)).getTime())){
						res.status(200).send(data);
						break loop1;
					}
				}
			}
			if(oper.moq_slab_list == null){
				res.status(500).send("No MOQ found")
			}			
		}else{
			res.status(500).send("No Operator Setting Found")
		}
	})
});

router.get('/org_subscription',VerifyToken, function(req, res) {
	const date = new Date();
	var current_date = new Date()
	
	var today = new Date(new Date()).setHours(23,59,59,999)
	var tomorrow = new Date(current_date);
	tomorrow.setDate(tomorrow.getDate() + 1);
	tomorrow.setHours(0,0,0,0);

	Subscription.findAll({raw:true,where:{org_id:req.orgId,expires_on:today}}).then(function(today){
		var fifth_date = new Date(date.setDate(date.getDate() + 5)).setHours(23,59,59,999);
		var fifth_obj = {org_id:req.orgId,expires_on: {[Op.gte]: tomorrow,[Op.lte]: fifth_date}}
		Subscription.findAll({raw:true,where:fifth_obj}).then(function(fifth){
			var next_of_five = new Date(new Date(fifth_date).setDate(new Date(fifth_date).getDate() + 1)).setHours(23,59,59,999);
			var tenth_date =  new Date(date.setDate(date.getDate() + 5)).setHours(23,59,59,999);
			var tenth_obj = {org_id:req.orgId,expires_on: {[Op.gte]: next_of_five,[Op.lte]: tenth_date}}
			Subscription.findAll({raw:true,where:tenth_obj}).then(function(tenth){
				var next_of_ten = new Date(new Date(tenth_date).setDate(new Date(tenth_date).getDate() + 1)).setHours(23,59,59,999);
				var twentyth_date =  new Date(date.setDate(date.getDate() + 10)).setHours(23,59,59,999);
				var twentyth_obj = {org_id:req.orgId,expires_on: {[Op.gte]: next_of_ten,[Op.lte]: twentyth_date}}
				Subscription.findAll({raw:true,where:twentyth_obj}).then(function(twentyth){
					var next_ten = new Date(new Date(twentyth_date).setDate(new Date(twentyth_date).getDate() + 1)).setHours(23,59,59,999);
					var thirtyth_date =  new Date(date.setDate(date.getDate() + 10)).setHours(23,59,59,999);
					var thirtyth_obj = {org_id:req.orgId,expires_on: {[Op.gte]: next_ten,[Op.lte]: thirtyth_date}}
					Subscription.findAll({raw:true,where:thirtyth_obj}).then(function(thirtyth){
						res.status(200).send({
							five : fifth.length,
							ten : tenth.length,
							twentyth: twentyth.length,
							thirtyth: thirtyth.length,
							today: today.length
						})					
					},function(err){res.status(500).send("There was a problem in finding the subscription")})
				},function(err){res.status(500).send("There was a problem in finding the subscription")})
			},function(err){res.status(500).send("There was a problem in finding the subscription")})
		},function(err){res.status(500).send("There was a problem in finding the subscription")})
	},function(err){res.status(500).send("There was a problem in finding the subscription")})
})

router.get('/bundle_list',VerifyToken, function(req, res) {
	var arr = [];
	OperatorSetting.findOne({raw:true, where:{org_id:req.orgId}}).then(function(oper){
		SubscriptionBundle.findAll({raw:true, where:{org_id:req.orgId}}).then(function(sub_bundle){
			var oper_bundle = oper.bundle;
			var oper_addbundle = oper.addonbundle;
			oper_bundle.map(function(base){
				var base_id = base.bundle_id;
				var bundle_list = sub_bundle.filter(function(item){
					return (base_id==item.bundle_id);
				})
				arr.push({bundle_name:base.bundle_name, count: bundle_list.length})
			})
			oper_addbundle.map(function(add){
				var add_id = add.bundle_id;
				var addbundle_list = sub_bundle.filter(function(item){
					return (add_id==item.bundle_id);
				})
				arr.push({bundle_name:add.bundle_name, count: addbundle_list.length})
			})
			res.status(200).send(arr)
		})
	})
})

router.get('/active',VerifyToken, function(req, res) {
	Subscription.findAll({raw:true,where:{org_id:req.orgId,stb:true,status:'Active'}}).then(function(stb_data){
		Subscription.findAll({raw:true,where:{org_id:req.orgId,status:'Active',[Op.or]: [{ app: true },{ app: false }]}}).then(function(app_data){
		 	res.status(200).send({stb:stb_data.length, app: app_data.length})
		})	
	})
})

router.get('/online',VerifyToken, function(req, res) {
var start_date = new Date()
var end_date = new Date(new Date().getTime() - 1*60000);
	ActiveLogin.findAll({raw:true,where:{device_type:['Mobile','TV'],org_id:req.orgId,updatedAt:{[Op.between]: [end_date, start_date]}}}).then(function(app_data){
		ActiveLogin.findAll({raw:true,where:{device_type:['STB'],org_id:req.orgId,updatedAt:{[Op.between]: [end_date, start_date]}}}).then(function(stb_data){
			res.status(200).send({stb:stb_data.length, app:app_data.length})
		})		
	})
})

module.exports = router;
