var app 			= require('./app'),
	http			= require('http'),
	editJsonFile 	= require('edit-json-file'),	
	port 			= 8017,
	conf 			= editJsonFile(__root+'config.json'),
	ManualRenewal	= require(__root+__core+'modules/manualRenewal'),
	schedule 		= require('node-schedule'),
	SubscriptionRenewal	= require(__root+__core+'modules/subscriptionRenewal'),
	SubscriptionRenewals	= require(__root+__core+'modules/subscriptionRenewals'),
	OperatorTokenDelete	= require(__root+__core+'modules/operatorTokenDelete'),
	manual_expire_time	= conf.get("manual_expire_time").split("."),
	autorenewal_time	= conf.get("autorenewal_time").split("."),
	zee_content_time	= conf.get("zee_content_time").split("."),
	oper_token_time  	= conf.get("oper_token_time").split("."),
	Adapter_mzaalo      = require(__root+__core+'modules/MzaaloAdaptor'),
	Adapter_shemaro     = require(__root+__core+'modules/ShemaroAdapter'),
	fs				 	= require('fs'),
	exec 				= require('child_process').exec,
	SyncMapper 			= require(__core+'modules/SyncMapper'),
	SMSRetry 			= require(__core+'modules/smsRetry'),
	erosAdapter         = require(__root+__core+'modules/erosAdapter'),
    erosProfileAdapter  = require(__root+__core+'modules/erosProfileAdapter'),
    vootAdapter = require(__root+__core+'modules/vootAdapter'),
    MoqSlabRenewal = require(__root+__core+'modules/moq_slab_renewal'),
    sonyAdapter = require(__root+__core+'modules/sonyAdapter'),
    slabrenewal_time	= conf.get("slabrenewal_time").split("."),
    SubBulk = require(__root+'subscription/SubscriberBulk');
    SubSingleOccurence = require(__root+'subscription/SubscriberSingleOccurence'),
	file_path_removal  = require(__root+__core+'modules/FilesRemoval'),
	PreActivationSchedular= require(__root+__core+'modules/PreActivationSchedular');

vootAdapter.insertContent();
sonyAdapter.insertContent();


var Timing      = __db_model.Timing;

    var ZeeCatalogue  		=require(__root+__core+'/modules/ZeeCatalogue');
//	ZeeCatalogue.get_content()


http.createServer(app).listen(port,function(){
	conf.get("D") && console.log('Express server listening on port ' + port);
})

AutoRenewal = schedule.scheduleJob({hour: autorenewal_time[0], minute: autorenewal_time[1]}, function(){
	// SubscriptionRenewal.Renewal()
	SubscriptionRenewals.Renewal()
});

SlabRenewal = schedule.scheduleJob({hour: slabrenewal_time[0], minute: slabrenewal_time[1]}, function(){
	MoqSlabRenewal.Entry()
});

ManualExpiry = schedule.scheduleJob({hour: manual_expire_time[0], minute: manual_expire_time[1]}, function(){
	ManualRenewal.Renewal()
});

ZeeContents = schedule.scheduleJob({hour: zee_content_time[0], minute: zee_content_time[1]}, function(){
    var ZeeCatalogue  		=require(__root+__core+'/modules/ZeeCatalogue');
	ZeeCatalogue.get_content()
});

OperatorToken = schedule.scheduleJob({hour: oper_token_time[0], minute: oper_token_time[1]}, function(){
	OperatorTokenDelete.Remove()
});

PreActivationRenewal = schedule.scheduleJob({hour: slabrenewal_time[0], minute: slabrenewal_time[1]},function(){
	PreActivationSchedular.Renewal()
})

PreActivationSchedular.Renewal()

Adapter_mzaalo.saveMovies();
Adapter_shemaro.saveMovies();
erosAdapter.saveMovies();
//erosProfileAdapter.initGetProfile();

setTimeout(function () {
  Timing.findAll({raw:true}).then(function(get_timings){
		if(get_timings == 0){
			var time_obj=[{"time":"00:00-00:30"},{"time":"00:30-01:00"},{"time":"01:00-01:30"},{"time":"01:30-02:00"},{"time":"02:00-02:30"},{"time":"02:30-03:00"},{"time":"03:00-03:30"},{"time":"03:30-04:00"},{"time":"04:00-04:30"},{"time":"04:30-05:00"},{"time":"05:00-05:30"},{"time":"05:30-06:00"},{"time":"06:00-06:30"},{"time":"06:30-07:00"},{"time":"07:00-07:30"},{"time":"07:30-08:00"},{"time":"08:00-08:30"},{"time":"08:30-09:00"},{"time":"09:00-09:30"},{"time":"09:30-10:00"},{"time":"10:00-10:30"},{"time":"10:30-11:00"},{"time":"11:00-11:30"},{"time":"11:30-12:00"},{"time":"12:00-12:30"},{"time":"12:30-13:00"},{"time":"13:00-13:30"},{"time":"13:30-14:00"},{"time":"14:00-14:30"},{"time":"14:30-15:00"},{"time":"15:00-15:30"},{"time":"15:30-16:00"},{"time":"16:00-16:30"},{"time":"16:30-17:00"},{"time":"17:00-17:30"},{"time":"17:30-18:00"},{"time":"18:00-18:30"},{"time":"18:30-19:00"},{"time":"19:00-19:30"},{"time":"19:30-20:00"},{"time":"20:00-20:30"},{"time":"20:30-21:00"},{"time":"21:00-21:30"},{"time":"21:30-22:00"},{"time":"22:00-22:30"},{"time":"22:30-23:00"},{"time":"23:00-23:30"},{"time":"23:30-00:00"}];
			Timing.bulkCreate(time_obj).then(function(data){});
		}
	});
}, 5000)

var path = __root+'mail_pdf';
if (!fs.existsSync(path)){
	exec("mkdir -p "+path,function(err,stdout,stderr){});
}

function syncsms(){
	setInterval(() => {
		SyncMapper.SYNC_SMS();
	}, 30000);
}
syncsms();

function sms_retry(){
	setInterval(() => {
		SMSRetry.RETRY();
	}, 900000);
}
sms_retry();

var hepi_path = '/etc/ec/hepi_image/'
if(!fs.existsSync(hepi_path)){
	exec("mkdir -p "+hepi_path,function(err,stdout,stderr){
		exec("mkdir -p "+hepi_path+'food',function(err,stdout,stderr){
			exec("mkdir -p "+hepi_path+'food_meta',function(err,stdout,stderr){
				exec("mkdir -p "+hepi_path+'service',function(err,stdout,stderr){
					exec("mkdir -p "+hepi_path+'service_meta',function(err,stdout,stderr){
						exec("mkdir -p "+hepi_path+'location_meta',function(err,stdout,stderr){
			                                exec("mkdir -p "+hepi_path+'location',function(err,stdout,stderr){
                        			        })
			                        })
					})
				})
			})
		})
	});
}

//SubBulk.create()
//SubSingleOccurence.create()
//file_path_removal.files()
//MoqSlabRenewal.moqEndtimeSchedular()
