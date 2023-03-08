var express           = require('express'),
    router            = express.Router(),
    bodyParser        = require('body-parser'),
    bcrypt            = require('bcryptjs'),
    editJsonFile      = require('edit-json-file'),
    conf              = editJsonFile(__root+'config.json'),
    Razorpay          = require(__root+__core+'modules/razorpayOld'),
    VerifyToken       = require(__root +__core+'modules/VerifyToken'),
    creditCalculation = require(__root+__core+'modules/creditCalculation'),
    logoutAndDelete   = require(__root+__core+'modules/logoutAndDelete'),
    transactionPDF    = require(__root +__core+'modules/TransactionPDFTemplate.js'),
    Mailer            = require(__root+__core+'modules/Mailer'),
    creditCalculation = require(__root+__core+'modules/creditCalculation'),
    HTTPCli           = require(__root+__core+'modules/HTTPClient'),
    sms_retry         = editJsonFile(__root+__core+'modules/smsRetry.json'),
    crypto            = require('crypto'),
    sequelize         = __db_model.sequelize,
    random_number     = require('random-number'),
    options           = { min:1, max:10000, integer:true},
    D                 = conf.get("D"),
    bundlepackage     = "bundlepackage",
    externalpackage   = "externalpackage",
    custompackage     = "custompackage";

router.use(bodyParser.json({limit: "4096mb", type:'application/json'}));

var Subscription  = __db_model.Subscription,
    Transaction   = __db_model.Transaction,
    User          = __db_model.User,
    Org           = __db_model.Org,
    Bundle        = __db_model.Bundle,
    AccessLogin   = __db_model.AccessLogin,
    OperatorToken = __db_model.OperatorToken,
    Token         = __db_model.Token,
    Invoice       = __db_model.Invoice,
    SubscriptionBundle = __db_model.SubscriptionBundle,
    OperatorSetting   = __db_model.OperatorSetting,
    BundlePackage     = __db_model.BundlePackage,
    Provider          = __db_model.Provider,
    Renewal           = __db_model.Renewal,
    EMM               = __db_model.EMM,
    BillSetting       = __db_model.BillSetting,
    SubscriptionPackage= __db_model.SubscriptionPackage,
    ExternalApp        = __db_model.ExternalApp,
    Coupon             = __db_model.Coupon,
    BundleExternalPackage=__db_model.BundleExternalPackage,
    BundleCustomExternalPackage= __db_model.BundleCustomExternalPackage,
    SubscriberExternalApp=__db_model.SubscriberExternalApp;
var keyObj = {
  'One Month'   : 'price_one_month',
  'Three Month' : 'price_three_month',
  'Six Month'   : 'price_six_month',
  'Twelve Month': 'price_twelve_month'
}
var valueObj= {
  'One Month'   : 1,
  'Three Month' : 3,
  'Six Month'   : 6,
  'Twelve Month': 12
}
var dayObj = {
  'One Month'   : 30,
  'Three Month' : 90,
  'Six Month'   : 180,
  'Twelve Month': 360
}
var renewalObj = {
  'One Month'   : 29,
  'Three Month' : 89,
  'Six Month'   : 179,
  'Twelve Month': 359
}

var code_obj = {
  "One Month"   : "monthly_code",
  "Three Month" : "quarterly_code",
  "Six Month"   : "halfyearly_code",
  "Twelve Month": "yearly_code"
}

function isEmpty(obj) {
  for(var key in obj) {
    if(obj.hasOwnProperty(key))
    return false;
  }
  return true;
}

function sendInvoice(id, filename, callbk){
  Transaction.findAll({where:{transaction_id:id},include:[Invoice]}).then(function(invoice){
    Org.findOne({raw:true,where:{org_id:invoice[0].org_id}}).then(function(org){
      var file_name = filename;
      var arr = [];
      transactionPDF.create(file_name,arr,org,invoice[0],function(path){
        var subject = 'Invoice from Skie';
        var attach = [{filename:file_name,path:path.filename}];
        Mailer.sendMail(null,null,org.report_email,false,null,attach,subject);
        callbk("Subscription created successfully");
      });  
    },function(err){
      res.status(500).send("There was a problem in adding the Subscription")
    })
  })
}
function generateActivationCode(customer_mail,mso_short_name) {
  var data = crypto.createHmac('sha256', customer_mail+mso_short_name+new Date())
                   .update('1vtabMRSS')
                   .digest('hex')
  var hash = 0, i, chr;
  if (data.length === 0) return hash;
  for (i = 0; i < data.length; i++) {
    chr   = data.charCodeAt(i);
    hash  = Math.abs(((hash << 5) - hash) + chr) + 10000000;
    hash |= 0;
  }
  var code = Math.abs(hash % 100000000);
  if (code.toString().length < 8) code = code+10000000;
  return code;
}

function getTotalPages(data,limit,cb) {
  var arr = [];
  data.rows.map(function (argument, i) {
    argument = argument.get({plain : true});
    argument.org_name =(argument.subscriberOrg && argument.subscriberOrg.org_name) ? argument.subscriberOrg.org_name : '';
    delete argument.subscriberOrg;
    arr.push(argument);
    if(i == data.rows.length-1){
      var roundoff = Math.round(data.count/limit);
      var page_list = data.count/limit;
      if(roundoff<page_list){
        page_list =roundoff+1;
      }else {
        page_list = roundoff;
      }
      var finalObj = {
        count : page_list,
        rows : arr
      }
      cb(finalObj);
    }
  })
}

function singleCreate(body,invoiceEntry,cb) {
  Subscription.create(body,{include:[{model:SubscriptionBundle},{model:SubscriptionPackage}]}).then(function(subs){
    Transaction.create(invoiceEntry,{include:[Invoice]}).then(function(trans){
      sendInvoice(trans.transaction_id, 'Invoice.pdf', callbk)
      function callbk(msg){
        cb(200,msg);
      }
    })
  },function(err){
    if(err && err.errors[0].message) { return cb(500, err.errors[0].message);} //DUPLICATE ENTRY FOR UNIQUE FIELD
    cb(500,"Subscription creation failed");
  })
}

function multipleCreate(subscription,bulkfinal,subPackArr,invoiceEntry,cb) {
  Subscription.bulkCreate(subscription).then(function(subs){
    SubscriptionBundle.bulkCreate(bulkfinal).then(function(sub_bundle) {
      SubscriptionPackage.bulkCreate(subPackArr).then(function (sub_pack) {
        Transaction.create(invoiceEntry,{include:[Invoice]}).then(function(trans){
          sendInvoice(trans.transaction_id, 'Invoice.pdf', callbk)
          function callbk(msg){
            cb(200,msg);
          }
        })
      })
    })
  },function(err){
    if(err && err.errors[0].message) { return cb(500, err.errors[0].message);} //DUPLICATE ENTRY FOR UNIQUE FIELD
    cb(500,"Subscription creation failed");
  })
}

function getPackages(exist_package){
  var packages={}
  for(var i=0;i<exist_package.length;i++){
    var pack_obj=exist_package[i];
    var package_id=pack_obj.package_id;
    packages[package_id]=pack_obj;
  }
  return packages;
}

function external_apps_call(flag,request,external_bundle_ids,expiryDate,external_cb) {
  var coupon_arr = [], empty_coupon_arr = [], remove_flag='true';
  var org_id = (flag == 'single') ? request.org_id :  request.arr[0].org_id;
  Org.findOne({raw:true,where:{org_id:org_id}}).then(function(org){
  
  SubscriberExternalApp.findAll({raw:true}).then(function(all_subscriber_app){
    Coupon.findAll({raw:true,where:{subscribed:false}}).then(function(coupons){
      BundleCustomExternalPackage.findAll({raw:true,where:{bundle_id:external_bundle_ids}}).then(function (all_custom_bundle) {
        var custom_ids = [];
        all_custom_bundle.map(function (line) {
          custom_ids.push(line.custom_external_bundle_id)
        })
        BundleExternalPackage.findAll({raw:true,where:{bundle_id:custom_ids}}).then(function (all_extern_pack) {
          var app_ids = [];
          all_extern_pack.map(function (lines) {
            app_ids.push(lines.external_app_id)
          })
          ExternalApp.findAll({raw:true,where:{external_app_id:app_ids}}).then(function (all_extern_app) {
            var subscriber_external_apps_arr = [];
            all_extern_app.map(function (row, i) {
              var code_data = code_obj[request.mode];
              subscriber_external_apps_arr.push({
                external_app_name     : row.name,
                external_package_name : row.package_name,
                activation_type       : row.activation_type,
                expiry_date           : expiryDate,
                code                  : row[code_data],
                remove                : 'false',
                org_name              : org.org_name,
                is_issued             : false
              })
              if((i+1) == all_extern_app.length){
                var subscriber_apps_arr = []
                if(flag == 'single'){
                  subscriber_external_apps_arr.map(function (obj) {
                    obj['subscriber_id'] = request.subscription_id
                    obj['mobile'] = request.mobile
                    obj['mode'] = request.mode
                    obj['name'] = request.name
                  })
                  subscriber_apps_arr  = subscriber_external_apps_arr;
                }else{
                  for (var i = 0; i < request.arr.length; i++) { 
                    var sub_index=request.arr[i]
                    var subscription_id=sub_index.subscription_id
                    for (var j = 0; j < subscriber_external_apps_arr.length; j++) { 
                      var bundle_index=subscriber_external_apps_arr[j]
                      bundle_index['subscriber_id'] = sub_index.subscription_id
                      bundle_index['mobile'] = sub_index.mobile
                      bundle_index['mode'] = sub_index.mode
                      bundle_index['name']  = sub_index.name
                      delete bundle_index.id
                      var sub_copied_bundle = Object.assign({}, bundle_index);    
                      subscriber_apps_arr.push(sub_copied_bundle)
                    }
                  }
                }

                let message = (
                  'Dear Support, <br><br>'+
                  'Subscriber Details and his Activated External App details <br><br>'+
                  '<table style="border-collapse: collapse;">' +
                  '<thead>' +
                  '<th style="border: 1px solid #333;"> Subscriber Name </th>' +
                  '<th style="border: 1px solid #333;"> Mobile Number </th>'  +
                  '<th style="border: 1px solid #333;"> Operator Name </th>'  +
                  '<th style="border: 1px solid #333;"> Mode </th>'  +
                  '<th style="border: 1px solid #333;"> List of External Apps </th>'  +
                  '</thead>'
                )
                var sub_app_obj = {}
                subscriber_apps_arr.map(function (row, j) {
                  var id = row.subscriber_id      
                  if(sub_app_obj[id] == undefined){
                    sub_app_obj[id] = {data:row, pack:row.external_app_name}
                  }else{
                    var get_data = sub_app_obj[id]
                    get_data.pack = get_data.pack +', '+ row.external_app_name
                  }
                  var exist_coupon = [];
                  all_subscriber_app.map(function(input){
                    if((input.subscriber_id == row.subscriber_id) && (input.external_package_name == row.external_package_name) && ((new Date(input.expiry_date).getTime()) >= (new Date().getTime()))){
                      exist_coupon = [input]
                    }
                  })

                  if(exist_coupon.length == 0){
                    if((row.activation_type == 'Coupon')) {
                      var availableCoupon = [];
                      coupons.map(function (index) {
                        if ((index.subscribed == false) && (index.external_package_name == row.external_package_name) && (index.coupon_validity == row.mode)){
                          availableCoupon=[index];
                        }
                      })
                      if(availableCoupon.length > 0){
                        coupon_arr.push(availableCoupon[0].coupon)
                        coupons.splice(coupons.findIndex(({coupon}) => coupon == availableCoupon[0].coupon), 1);
                      }else{
                        var code_data = code_obj[request.mode];
                        empty_coupon_arr.push({
                          external_app_name     : row.external_app_name,
                          external_package_name : row.external_package_name,
                          code                  : row.code,
                          coupon_validity       : request.mode,
                          subscribed            :  true,
                          issued                :  false 
                        })
                      }
                    }
                  }else{
                    row.remove = 'true'
                  }
                  if(j+1 == subscriber_apps_arr.length){
                    subscriber_apps_arr = subscriber_apps_arr.filter(function( obj ) {
                      return obj.remove == 'false';
                    });
                    data_process();
                  }
                })
                function data_process() {
                  Coupon.update({subscribed : true},{where:{coupon:coupon_arr}}).then(function(update_coupon){
                    Coupon.bulkCreate(empty_coupon_arr).then(function (create_coupon) {
                      SubscriberExternalApp.bulkCreate(subscriber_apps_arr).then(function(sub_extern_app){
                        Coupon.findAll({raw:true}).then(function(coupon_data){
                          var check_index = 0;
                          var app_size = Object.keys(sub_app_obj).length
                          for(n in sub_app_obj){
                            var app_pack = sub_app_obj[n]
                            check_index++
                            message += (
                              '<tr>' +
                              '<td style="border: 1px solid #333;">' + app_pack.data.name + '</td>' +
                              '<td style="border: 1px solid #333;">' +  app_pack.data.mobile+ '</td>' +
                              '<td style="border: 1px solid #333;">' +  app_pack.data.org_name+ '</td>' +
                              '<td style="border: 1px solid #333;">' +  app_pack.data.mode+ '</td>' +
                              '<td style="border: 1px solid #333;">' +  app_pack.pack+ '</td>' +
                              '</tr>'
                            )
                            if(check_index == app_size){
                              message +=(
                                '</table><br><br>'+
        'Total , subscribed and Issued  Coupon count of all external Apps<br><br>' 
                              )
                              coupon_list()
                            }

                          }
                          function coupon_list(){
                            var coupon_obj = {};
                            coupon_data.map(function(iter, x){
                              if(coupon_obj[iter.external_app_name] == undefined){
                                var total_value =  1
                                var subscribed_value = ((iter.subscribed == true) && (iter.issued == false) && (iter.coupon!=null)) ? 1 : 0
                                var issued_value = ((iter.issued == true) && (iter.subscribed == true) && (iter.coupon!=null)) ? 1 : 0
                                var empty_value = (iter.coupon == null) ? 1 : 0
                                var total_subscribed = subscribed_value + issued_value;
                                var unused = total_value - total_subscribed;
                                coupon_obj[iter.external_app_name] = {total: total_value, subscribed: subscribed_value, issued : issued_value, empty :empty_value , pack_name : iter.external_package_name, total_subscribed :total_subscribed, unused: unused};
                              }else{
                                var coupon_template = coupon_obj[iter.external_app_name]
                          subscribed_value = ((iter.subscribed == true) && (iter.issued == false) && (iter.coupon != null)) ? (coupon_template.subscribed + 1) : coupon_template.subscribed;
                                issued_value = ((iter.issued == true) && (iter.subscribed == true) && (iter.coupon!=null) ) ? (coupon_template.issued + 1) : coupon_template.issued
                                empty_value = (iter.coupon == null) ? (coupon_template.empty + 1) : coupon_template.empty
                                total_value =  coupon_template.total + 1
                                total_subscribed = subscribed_value + issued_value;
                                unused = total_value - total_subscribed;

                                coupon_obj[iter.external_app_name] = {total: total_value, subscribed: subscribed_value, issued : issued_value, empty :empty_value , pack_name : iter.external_package_name, total_subscribed :total_subscribed, unused: unused};
                              }
                              if(x+1 == coupon_data.length){
                                var count = 0
                                var size = Object.keys(coupon_obj).length;
                                message += (
                                  '<table style="border-collapse: collapse;">' +
                                  '<thead>' +
                                  '<th style="border: 1px solid #333;"> External App (1)</th>' +
                                  '<th style="border: 1px solid #333;"> Package Name (2)</th>'  +
                                  '<th style="border: 1px solid #333;"> Total Coupons (3)</th>'  +
                                  '<th style="border: 1px solid #333;"> Subscribed Coupons (4)<br>(5+6)</th>'  +
                                  '<th style="border: 1px solid #333;"> Issued Coupons (5)</th>'  +
                                  '<th style="border: 1px solid #333;"> UnSubscribed Coupons (6)</th>'  +
                                  '<th style="border: 1px solid #333;"> Unused Coupons (7)<br>(3-4)</th>'  +
                                  '<th style="border: 1px solid #333;"> Empty Coupons (8)</th>'  +
                                  '</thead>'
                                )
                                for(j in coupon_obj){
                                  count ++;
                                  message += (
                                    '<tr>' +
                                    '<td style="border: 1px solid #333;">' + j + '</td>' +
                                    '<td style="border: 1px solid #333;">' +  coupon_obj[j].pack_name+ '</td>' +
                                    '<td style="border: 1px solid #333;">' +  coupon_obj[j].total+ '</td>' +
                                    '<td style="border: 1px solid #333;">' +  coupon_obj[j].total_subscribed+ '</td>' +
                                    '<td style="border: 1px solid #333;">' +  coupon_obj[j].issued+ '</td>' +
                                    '<td style="border: 1px solid #333;">' +  coupon_obj[j].subscribed+ '</td>' +
                                    '<td style="border: 1px solid #333;">' +  coupon_obj[j].unused+ '</td>' +
                                    '<td style="border: 1px solid #333;">' +  coupon_obj[j].empty+ '</td>' +
                                    '</tr>'
                                  )
                                  if(size == count){
                                    message += (
                                      '</table><br><br>'+
                                      'Regards,<br>'+
                                      'Infynect Labs'
                                    )
                                    Mailer.sendMail(null,null,conf.get("support_mail"),null,message,null,'Message From Skie');
                                  }
                                }
                              }
                            })
                          }
                        })
                        external_cb(1);
                      })
                    })
                  })
                }
              }
            })
          })
        })
      })
    })
  })
  })

}


router.post('/' , VerifyToken, function (req, res) {
  var bulkfinal=[]
  var sms_ids = [];
  var external_bundle_ids = [];
  User.findOne({raw:true,where:{user_id:req.userId}}).then(function(user){
    Org.findOne({raw:true,where:{org_id:user.org_id}}).then(function(org){
      OperatorSetting.findOne({raw:true,where:{org_id:user.org_id}}).then(function(oper){
        var days = (renewalObj[req.body.mode]) 
        var date = new Date();
        var active_date = new Date().setHours(0,0,0,0);
        var expiry = new Date();
        var expiryDate = new Date(expiry.setDate(expiry.getDate() + days)).setHours(23,59,59,999);
        var firstDay = new Date(date.getFullYear(), date.getMonth(), 1);

        function sms_call (){
          var org_address = org.city+', '+org.state+', '+org.pincode
          if(req.body.checkIptv){
            var m2m_payload;
            req.body.subscription_bundles.map(function(pos){
              if(pos.iptv){
                sms_ids.push(pos.bundle_id)
              }
            })
            if(req.body.bulkCreate){
              req.body.arr.map(function(like){
                  like.activation_code = JSON.stringify(generateActivationCode(like.email,org.short_code));
                  like.user_id = user.user_id;
                  like.org_id = user.org_id;
                  like.customer_firstname = like.name;
                  like.billing_address = org_address;
                  like.billing_city = org.city;
                  like.billing_pincode = org.pincode;
                  like.installation_address = org_address;
                  like.installation_city = org.city;
                  like.installation_pincode = org.pincode;
                  like.installation_state = org.state;
                  like.billing_state = org.state;
                  like.unique_id = like.serial_no;
                  like.account_lock = 'Disable';
                  like.username = like.name;
                  like.email = like.email;
                  like.phone_number = like.mobile;
                  like.start_date = active_date;
                  like.end_date = expiryDate;
              })
              m2m_payload = {
                customer : req.body.arr,
              }
            }else{
              req.body.activation_code = generateActivationCode(req.body.email,org.short_code);
              req.body.user_id = user.user_id;
              req.body.org_id = user.org_id;
              req.body.customer_firstname = req.body.name;
              req.body.billing_address = org_address;
              req.body.billing_city = org.city;
              req.body.billing_pincode = org.pincode;
              req.body.installation_address = org_address;
              req.body.installation_city = org.city;
              req.body.installation_pincode = org.pincode;
              req.body.installation_state = org.state;
              req.body.billing_state = org.state;
              req.body.unique_id = req.body.serial_no;
              req.body.account_lock = 'Disable';
              req.body.username = req.body.name;
              req.body.email = req.body.email;
              req.body.phone_number = req.body.mobile;
              req.body.start_date = active_date;
              req.body.end_date = expiryDate;
        req.body.mac_address = req.body.mac_address;
              m2m_payload = {
                customer : [req.body]
              }
            }
            BundlePackage.findAll({raw:true,where:{bundle_id:sms_ids},attributes:{exclude:['id','createdAt','updatedAt']},}).then(function(bun){
              var pro_id =bun[0].provider_id
              Provider.findOne({raw:true,where:{provider_id:pro_id}}).then(function(provider){
                bun.map(function(input){
                  input.status = 'COMPLETED';
                  input.start_date   = active_date;
                  var iptv_package_name = input.package_name.split('-');
                  input.package_name=iptv_package_name[1];
                })

                m2m_payload['package'] = bun;
                m2m_payload['user_id'] = user.user_id;
    EMM.update({status:'Active'},{where:{unique_id:req.body.unique_id}}).then(function(updated_emm){
    });
                var obj=HTTPCli.M2MReq(provider.sms_host,provider.sms_port,'POST',m2m_payload,'/api/partner/subscription',provider.sms_token);
                HTTPCli.https_to_SMS(obj,sucess_cb,error_cb);
                function error_cb(err){
                  m2m_payload['sms_host'] = provider.sms_host;
                  m2m_payload['sms_port'] = provider.sms_port;
                  m2m_payload['sms_token'] = provider.sms_token;
                  m2m_payload['api'] = '/api/partner/subscription';
                  var retry_key = 'payload'+random_number(options);
                  m2m_payload['retry_key'] = retry_key;
                  sms_retry.set(retry_key, m2m_payload);
                  sms_retry.save();
                }
                function sucess_cb(data){
                  D && console.log("sucess",data);
                }
              })
            })
          }
        }
        var credit_obj = {
          org_id:user.org_id,
          status:'Approved',
          time_stamp: { [Op.between]: [firstDay, date]}
        }
        creditCalculation.Calculate(credit_obj ,cb)
        function cb(data){
          if(data.status == 200){
            var account_balance=0;
            account_balance = Number(data.msg.object.toFixed(2))

            var payable_amt = 0
            payable_amt =  req.body.amount
            // account_balance = 10
            var expiry = new Date();
            var expires = new Date(expiry.setDate(expiry.getDate() + days))
            var no_of_days=parseInt((new Date(expires)-date)/(1000*60*60*24))+1;

            var month = keyObj[req.body.mode];
            var amt_per_day;
            var add_on_without_gst=0;
            var add_on_with_gst;
            var ott_flag = false;
            var ott_amt = 0, ott_amt_with_gst = 0;
            if(!req.body.bulkCreate){
              req.body.status = 'New';
              req.body.org_id = user.org_id;
              req.body.reseller_org_id = user.reseller_org_id;
              req.body.expires_on = expiryDate;
              var getBundleId = []
              req.body.subscription_bundles.map(function(ip){
                getBundleId.push(ip.bundle_id)
                if(!ip.iptv){
                  ott_flag = true;
                  if(ip.base && ip.bundle_type == bundlepackage){
                    ott_amt = ott_amt + ip[month];
                  }
                  if(ip.base && ip.bundle_type == custompackage){
                    ott_amt = ott_amt + ip.bundle_cost;
                  }
                  if(ip.addon && ip.bundle_type == bundlepackage){
                    ott_amt = ott_amt + ip[month];
                  }
                  if(ip.addon && ip.bundle_type == externalpackage){
                    ott_amt = ott_amt + ip[month];
                  }
                  if(ip.addon && ip.bundle_type == custompackage){
                    ott_amt = ott_amt + ip.bundle_cost;
                  }
                }
                if(ip.addon && ip.bundle_type == bundlepackage){
                  add_on_without_gst = add_on_without_gst + ip[month];
                }
                if(ip.addon && ip.bundle_type == externalpackage){
                  add_on_without_gst = add_on_without_gst + ip[month];
                }
                if(ip.addon && ip.bundle_type == custompackage){
                  add_on_without_gst = add_on_without_gst + ip.bundle_cost;
                }
                ip.org_id = org.org_id;
                if(ip.is_external_packages){
                  external_bundle_ids.push(ip.bundle_id)
                }
              })
              
              BundlePackage.findAll({raw:true,where:{bundle_id:getBundleId},attributes:{exclude:['id']}}).then(function (bundlepack) {
                var bundlepack=bundlepack.filter(function(thing,index){
                  delete thing.id
                  return index === bundlepack.findIndex(function(obj){
                    return obj.package_id===thing.package_id;
                  });
                });
                bundlepack.map(function (bp) {
                  bp.expiry_date = expiryDate
                })
                req.body.subscription_packages = bundlepack;
                ott_amt_with_gst = Number((ott_amt+((ott_amt*18)/100)).toFixed(2));
                add_on_with_gst = Number((add_on_without_gst+((add_on_without_gst*18)/100)).toFixed(2));
                payable_amt = add_on_with_gst+req.body.amount;
                if(ott_flag && req.body.stb && req.body.app){
                  payable_amt = Number((payable_amt + (ott_amt_with_gst-((ott_amt_with_gst*oper.discount)/100))).toFixed(2));
                }

                if(account_balance >= payable_amt) {
                  Transaction.findOne({raw:true,where:{invoice_year:new Date().getFullYear()},order:[['trans_id','DESC']],limit:1}).then(function(trans){
                    var invoiceEntry = {
                      org_id         :user.org_id,
                      org_name       :org.org_name,
                      reseller_org_id:user.reseller_org_id,
                      type           : 'Debit',
                      status         :'Approved',
                      payment_method : 'Offline',
                      criteria       : 'Direct',
                      total_amount   : payable_amt,
                      invoices       : []
                    }
                    if(trans){
                      if(trans.invoice_year == new Date().getFullYear()){
                        invoiceEntry.invoice_acc_id = trans.invoice_acc_id + 1
                        invoiceEntry.invoice_year = new Date().getFullYear()
                        invoiceEntry.invoice_id = 'INV-'+invoiceEntry.invoice_year+'AC'+invoiceEntry.invoice_acc_id
                      }else{
                        invoiceEntry.invoice_acc_id = 1
                        invoiceEntry.invoice_year = new Date().getFullYear()
                        invoiceEntry.invoice_id = 'INV-'+invoiceEntry.invoice_year+'AC'+invoiceEntry.invoice_acc_id
                      }
                    }else{
                      invoiceEntry.invoice_acc_id = 1
                      invoiceEntry.invoice_year = new Date().getFullYear()
                      invoiceEntry.invoice_id = 'INV-'+invoiceEntry.invoice_year+'AC'+invoiceEntry.invoice_acc_id
                    }

                    var addon_name = ''
                    req.body.subscription_bundles.map(function(ip){
                      addon_name = (addon_name=='')?ip.bundle_name:addon_name+', '+ip.bundle_name
                      // if(!oper.enable_bundle_creation){
                        var invoice_obj = {
                          bund_name : ip.bundle_name,
                          mode      : req.body.mode,
                          
                          quantity  : 1,
                          status    : 'Payment'
                        }
                        if(ip.bundle_type == 'custompackage'){
                          invoice_obj['amt'] =(ip.bundle_cost*1);
                          invoice_obj['rate']  = ip.bundle_cost;
                        }else{
                          invoice_obj['amt'] =(ip[month]*1);
                          invoice_obj['rate']  = ip[month];
                        }
                        invoiceEntry.invoices.push(invoice_obj)
                        if(!ip.iptv && ott_flag && req.body.stb && req.body.app) {
                          var invoice_object = {
                            bund_name : ip.bundle_name,
                            mode      : req.body.mode,
                            quantity  : 1,
                            status    : 'Payment',
                            discount  : oper.discount+ '% discount'
                          }
                          invoiceEntry.invoices.push(invoice_object);
                          if(ip.bundle_type == 'custompackage'){
                            invoice_object['amt'] =(ip.bundle_cost - (ip.bundle_cost*oper.discount/100));
                            invoice_object['rate']  = ip.bundle_cost;
                          }else{
                            invoice_object['amt'] =(ip[month] - (ip[month]*oper.discount/100));
                            invoice_object['rate']  = ip[month];
                          }
                        }
                      // }
                    })
                    // if(!oper.enable_bundle_creation){
                      invoiceEntry.invoices.push({
                        bund_name : addon_name,
                        mode      : req.body.mode,
                        status    : 'Adjustment',
                        amt       : payable_amt
                      })
                    // }

                    invoiceEntry['bundle'] = addon_name; 
                    invoiceEntry['total_amount'] = payable_amt;
                    invoiceEntry['paid_amount'] = 0;
                    req.body.activated_on = new Date().setHours(0,0,0,0);
                    singleCreate(req.body,invoiceEntry,function (status,cb_data) {
                      if(status == 200){
      if(external_bundle_ids.length > 0) {
                          external_apps_call('single',req.body,external_bundle_ids,expiryDate,function (argument) {
                            sms_call();
                            res.status(status).send(cb_data);
                          })
      }else{
        sms_call();
                                res.status(status).send(cb_data);
      }
                      }else{
                        res.status(status).send(cb_data);
                      }
                    });
                  })
                }else{
                  adjust_pay()
                }
              })
            }else if(req.body.bulkCreate){
              Subscription.findAll({raw:true}).then(function(checkSubs){
                var dupeArr = [];
                req.body.arr.map(function(input){
                  if (checkSubs.some(function (item){return((item.email == input.email) || (item.mobile == input.mobile)) })){
                    dupeArr.push(input)
                  }
                })
                if(dupeArr.length > 0){
                  res.status(500).send({dupe:dupeArr});
                }else{
                  req.body.arr.map(function(ele){
                    ele.mobile = ele.mobile.replace('\r', '');
                  })
                  var subscription=req.body.arr
                  if(req.body.add_on){
                    var bundles=req.body.subscription_bundles
                    bundles.map(function (check_external) {
                      if(check_external.is_external_packages){
                        external_bundle_ids.push(check_external.bundle_id)
                      }
                    })
                    var getBundleId = [], sub_id = [];
                    for (var i = 0; i < subscription.length; i++) { 
                      var sub_index=subscription[i]
                      sub_id.push(sub_index.subscription_id);
                      sub_index.status = 'New';  
                      sub_index.org_id = user.org_id;
                      sub_index.reseller_org_id = user.reseller_org_id;
                      sub_index.expires_on = expiryDate;
                      sub_index.activated_on = new Date().setHours(0,0,0,0);
                      var subscription_id=sub_index.subscription_id
                      for (var j = 0; j < bundles.length; j++) { 
                        var bundle_index=bundles[j]
                        getBundleId.push(bundle_index.bundle_id);
                        delete bundle_index.id
                        bundle_index.subscription_id=subscription_id    
                        bundle_index.org_id = org.org_id;
                        var copied_bundle = Object.assign({}, bundle_index);    
                        bulkfinal.push(copied_bundle)
                        if(!bundle_index.iptv){
                          ott_flag = true;
                          if(bundle_index.add_on && bundle_index.bundle_type == bundlepackage){
                           // amt_per_day = (bundle_index[month]/dayObj[req.body.mode]);
                            ott_amt = ott_amt + (bundle_index[month]);  
                          }
                          if(bundle_index.addon && bundle_index.bundle_type == externalpackage){
                            ott_amt = ott_amt + bundle_index[month];
                          }
                          if(bundle_index.add_on && bundle_index.bundle_type == custompackage){
                         //   amt_per_day = (bundle_index.bundle_cost/dayObj[req.body.mode]);
                            ott_amt = ott_amt + (bundle_index.bundle_cost);  
                          }
                          if(bundle_index.base && bundle_index.bundle_type == bundlepackage){
                            var key = keyObj[req.body.mode];
                            ott_amt = ott_amt + bundle_index[key];
                          }
                          if(bundle_index.base && bundle_index.bundle_type == custompackage){
                            ott_amt = ott_amt + bundle_index.bundle_cost;
                          }
                        }
                        if(bundle_index.add_on && bundle_index.bundle_type == bundlepackage){
                          // amt_per_day = (bundle_index[month]/dayObj[req.body.mode]);
                          add_on_without_gst = add_on_without_gst + (bundle_index[month]);  
                        }
                        if(bundle_index.addon && bundle_index.bundle_type == externalpackage){
                          add_on_without_gst = add_on_without_gst + bundle_index[month];
                        }
                        if(bundle_index.add_on && bundle_index.bundle_type == custompackage){
                          // amt_per_day = (bundle_index.bundle_cost/dayObj[req.body.mode]);
                          add_on_without_gst = add_on_without_gst + (bundle_index.bundle_cost);  
                        }
                        if(bundle_index.base && bundle_index.bundle_type == bundlepackage){
                          var key = keyObj[req.body.mode];
                          add_on_without_gst = add_on_without_gst + bundle_index[key];
                        }
                        if(bundle_index.base && bundle_index.bundle_type == custompackage){
                          // var key = keyObj[req.body.mode];
                          add_on_without_gst = add_on_without_gst + bundle_index.bundle_cost;
                        }
                      }
                    }
                    ott_amt_with_gst = Number((ott_amt+((ott_amt*18)/100)).toFixed(2))
                    add_on_with_gst = Number((add_on_without_gst+((add_on_without_gst*18)/100)).toFixed(2))
                    payable_amt = add_on_with_gst;
                  }else{
                    var sub_id = [];
                    req.body.arr.map(function(arg){
                      sub_id.push(arg.subscription_id);
                      arg.status = 'New';  
                      arg.org_id = user.org_id;
                      arg.reseller_org_id = user.reseller_org_id;
                      arg.expires_on = expiryDate;
                      arg.activated_on = new Date().setHours(0,0,0,0);
                      req.body.subscription_bundles.map(function (input){
                        if(input.is_external_packages){
                          external_bundle_ids.push(input.bundle_id)
                        }
                        var copied_bundle = Object.assign({}, input); 
                        copied_bundle.subscription_id = arg.subscription_id;
                        bulkfinal.push(copied_bundle);
                      })
                    })
                    payable_amt = 0;
                    var getBundleId = []
                    req.body.subscription_bundles.map(function(content){
                      getBundleId.push(content.bundle_id)
                      if(!content.iptv){
                        ott_flag = true;
                        ott_amt = ott_amt + req.body.amount;
                      }
                      var key = keyObj[req.body.mode];
                      if (content.bundle_type == 'custompackage') {
                        payable_amt = payable_amt + content.bundle_cost;
                      }else{
                        payable_amt = payable_amt + content[key];
                      }
                    })
                    payable_amt = payable_amt * req.body.arr.length
                    ott_amt_with_gst = Number((ott_amt+((ott_amt*18)/100)).toFixed(2))
                    payable_amt = payable_amt + (payable_amt*18/100);
                  }
                  BundlePackage.findAll({raw:true,where:{bundle_id:getBundleId},attributes:{exclude:['id']}}).then(function (bundlepack) {
                    var bundlepack=bundlepack.filter(function(thing,index){
                      delete thing.id
                      return index === bundlepack.findIndex(function(obj){
                        return obj.package_id===thing.package_id;
                      });
                    });
                    var subPackArr = [];
                    sub_id.map(function (property) {
                      bundlepack.map(function (bp) {
                        bp.expiry_date = expiryDate
                        bp.subscription_id = property
                        var copied_pack = Object.assign({}, bp);   
                        subPackArr.push(copied_pack)
                      })
                    })
                    if(ott_flag && req.body.arr[0].stb && req.body.arr[0].app){
                      payable_amt = Number((payable_amt + (ott_amt_with_gst-((ott_amt_with_gst*oper.discount)/100))).toFixed(2));
                    }
                    if(account_balance >= payable_amt) {
                      Transaction.findOne({raw:true,where:{invoice_year:new Date().getFullYear()},order:[['trans_id','DESC']],limit:1}).then(function(trans){
                        var invoiceEntry = {
                          org_id         : user.org_id,
                          org_name       : org.org_name,
                          reseller_org_id: user.reseller_org_id,
                          type           : 'Debit',
                          status         : 'Approved',
                          payment_method : 'Offline',
                          criteria       : 'Direct',
                          total_amount   : payable_amt,
                          invoices       : []
                        }
                        if(trans){
                          if(trans.invoice_year == new Date().getFullYear()){
                            invoiceEntry.invoice_acc_id = trans.invoice_acc_id + 1
                            invoiceEntry.invoice_year = new Date().getFullYear()
                            invoiceEntry.invoice_id = 'INV-'+invoiceEntry.invoice_year+'AC'+invoiceEntry.invoice_acc_id
                          }else{
                            invoiceEntry.invoice_acc_id = 1
                            invoiceEntry.invoice_year = new Date().getFullYear()
                            invoiceEntry.invoice_id = 'INV-'+invoiceEntry.invoice_year+'AC'+invoiceEntry.invoice_acc_id
                          }
                        }else{
                          invoiceEntry.invoice_acc_id = 1
                          invoiceEntry.invoice_year = new Date().getFullYear()
                          invoiceEntry.invoice_id = 'INV-'+invoiceEntry.invoice_year+'AC'+invoiceEntry.invoice_acc_id
                        }

                        var addon_name = ''
                        req.body.subscription_bundles.map(function(ip){
                          addon_name = (addon_name=='')?ip.bundle_name:addon_name+', '+ip.bundle_name
                          // if(!oper.enable_bundle_creation){
                            var invoice_obj = {
                              bund_name : ip.bundle_name,
                              mode      : req.body.mode,
                              quantity  : req.body.arr.length,
                              status    : 'Payment',
                            }
                            invoiceEntry.invoices.push(invoice_obj)
                            if(ip.bundle_type == 'custompackage'){
                              invoice_obj['amt'] =(ip.bundle_cost*req.body.arr.length);
                              invoice_obj['rate']  = ip.bundle_cost;
                            }else{
                              invoice_obj['amt'] =(ip[month]*req.body.arr.length);
                              invoice_obj['rate']  = ip[month];
                            }
                            if(!ip.iptv && ott_flag && req.body.arr[0].stb && req.body.arr[0].app) {
                              var invoice_object = {
                                bund_name : ip.bundle_name,
                                mode      : req.body.mode,
                                quantity  : req.body.arr.length,
                                status    : 'Payment',
                                discount : oper.discount+ '% discount'
                              }
                              invoiceEntry.invoices.push(invoice_object)  
                              if(ip.bundle_type == 'custompackage'){
                                invoice_object['amt'] =((ip.bundle_cost -(ip.bundle_cost*oper.discount/100)) * req.body.arr.length);
                                invoice_object['rate']  = ip.bundle_cost;
                              }else{
                                invoice_object['amt'] =((ip[month] -(ip[month]*oper.discount/100)) * req.body.arr.length);
                                invoice_object['rate']  = ip[month];
                              } 
                            }
                          // }
                        })
                        // if(!oper.enable_bundle_creation){
                          invoiceEntry.invoices.push({
                            bund_name : addon_name,
                            mode      : req.body.mode,
                            status    : 'Adjustment',
                            amt       : payable_amt
                          })
                        // }

                        invoiceEntry['bundle'] = addon_name 
                        invoiceEntry['total_amount'] = payable_amt 
                        
                        multipleCreate(subscription,bulkfinal,subPackArr,invoiceEntry,function(status,cb_data){
                          if(status == 200){
        if(external_bundle_ids.length >0){
                             external_apps_call('multiple',req.body,external_bundle_ids,expiryDate,function (argument) {
                                sms_call();
                                res.status(status).send(cb_data);
                             });
        }else{
          sms_call();
                                        res.status(status).send(cb_data);
        }
                          }else{
                            res.status(status).send(cb_data);
                          }
                        })
                      })
                    }else{
                      adjust_pay()
                    }
                  })
                }
              })
            }
            function  adjust_pay() {
              if(account_balance > 0){
                var msg ="Rs "+account_balance+" been adjusted with the credit"
              }else{
                var msg ="No Credit available please make the payment to proceed!"
              }
              var finalAmt = payable_amt - account_balance;
              res.status(200).send({
                msg: msg,
                btn: "Make Rs."+finalAmt+" payment to complete",
                account_balance: account_balance,
                adjusted_amount: finalAmt
              });
            }
          }
        }
      })
    })
  })
})

router.post('/adjustablePay' , VerifyToken, function (req, res) {
  var sms_ids = [];
  var external_bundle_ids = [];
  var redirection_url = req.body.redirection_url;

  User.findOne({raw:true,where:{user_id:req.userId}}).then(function(user){
    Org.findOne({raw:true,where:{org_id:user.org_id}}).then(function(org){
      OperatorSetting.findOne({raw:true,where:{org_id:user.org_id}}).then(function(oper){
        BillSetting.findOne({raw:true}).then(function(payment_details){
          if(req.body.adjust_update && req.body.update_and_renew){
            var callback_url  = redirection_url+"?adjust_update=true&update_and_renew=true&app="+req.body.app+"/#/admin/subscription";
          }else if(req.body.adjust_update){
            var callback_url  = redirection_url+"?adjust_update=true&app="+req.body.app+"/#/admin/subscription";
          }else {
            if(req.body.bulkCreate){
            var callback_url  = redirection_url+"?checkIptv="+req.body.arr[0].checkIptv+"&creation=bulkCreate/#/admin/subscription";    
            }else{
              var callback_url  = redirection_url+"?checkIptv="+req.body.checkIptv+"&creation=singleCreate/#/admin/subscription";
            }
          }
          // var callback_url  = conf.get("redirection_url")+"/#/admin/subscription";
          const payload = {
            amount: Number((req.body.adjusted_amount*100).toFixed(2)),
            currency: "INR",
            customer: {
              "name": org.org_name,
              "email": org.report_email,
              "contact": 91 + org.phone_no
            },
            notify: {
              sms: true,
              email: true
            },
            callback_url: callback_url,
            callback_method: "get"
          };

          var month = keyObj[req.body.mode];
          Razorpay.createPaymentLink(payload,payment_details,function(response){
            if(response){
              var url=response.short_url.replace(/<[^>]*>/g, '')
              if(url){
                Transaction.findOne({raw:true,where:{invoice_year:new Date().getFullYear()},order:[['trans_id','DESC']],limit:1}).then(function(trans){
                  var invoiceEntry = {
                    org_id:user.org_id,
                    org_name:org.org_name,
                    reseller_org_id:user.reseller_org_id,
                    type : 'Debit',
                    status:'Pending',
                    payment_method: 'Online',
                    criteria        : 'Direct',
                    bundle:req.body.bundle,
                    total_amount : req.body.adjusted_amount,
                    paid_amount : req.body.adjusted_amount,
                    retainer_invoice_id : response.id
                  }
                  if(req.body.bundle){
                    var invoice_entry = {
                      bund_name : req.body.bundle,
                      mode      : req.body.mode,
                      quantity  : req.body.quantity,
                      status    : 'Payment'
                    }
                    invoiceEntry['invoices'] = [
                      {
                        bund_name : req.body.bundle,
                        mode      : req.body.mode,
                        status    : 'Adjustment',
                        amt       : req.body.account_balance
                      }
                    ]
                    invoiceEntry.invoices.push(invoice_entry)
                    if(req.body.bundle_type == 'custompackage'){
                      invoice_entry['rate']      = req.body.bundle_cost;
                      invoice_entry['amt']       = (req.body.bundle_cost * req.body.quantity);
                    }else{
                      invoice_entry['rate']      = req.body.rate;
                      invoice_entry['amt']       = (req.body.rate * req.body.quantity);
                    }
                  }
                  if(trans){
                    if(trans.invoice_year == new Date().getFullYear()){
                      invoiceEntry.invoice_acc_id = trans.invoice_acc_id + 1
                      invoiceEntry.invoice_year = new Date().getFullYear()
                      invoiceEntry.invoice_id = 'INV-'+invoiceEntry.invoice_year+'AC'+invoiceEntry.invoice_acc_id
                    }else{
                      invoiceEntry.invoice_acc_id = 1
                      invoiceEntry.invoice_year = new Date().getFullYear()
                      invoiceEntry.invoice_id = 'INV-'+invoiceEntry.invoice_year+'AC'+invoiceEntry.invoice_acc_id
                    }
                  }else{
                    invoiceEntry.invoice_acc_id = 1
                    invoiceEntry.invoice_year = new Date().getFullYear()
                    invoiceEntry.invoice_id = 'INV-'+invoiceEntry.invoice_year+'AC'+invoiceEntry.invoice_acc_id
                  }
                var bulk_req = [
                  {
                    org_id:user.org_id,
                    org_name:org.org_name,
                    reseller_org_id:user.reseller_org_id,
                    type : 'Credit',
                    criteria : 'Direct',
                    status:'Pending',
                    payment_method: 'Online',
                    bundle:req.body.bundle,
                    total_amount : req.body.adjusted_amount,
                    paid_amount : req.body.adjusted_amount,
                    retainer_invoice_id : response.id,
                    invoice_acc_id :invoiceEntry.invoice_acc_id,
                    invoice_year :invoiceEntry.invoice_year,
                    invoice_id :invoiceEntry.invoice_id
                  }
                ]
                if(req.body.account_balance != 0){
                bulk_req.unshift({
                    org_id:user.org_id,
                    org_name:org.org_name,
                    reseller_org_id:user.reseller_org_id,
                    type : 'Debit',
                    criteria : 'Direct',
                    status:'Pending',
                    payment_method: 'Online',
                    bundle:req.body.bundle,
                    total_amount : req.body.account_balance,
                    retainer_invoice_id : response.id,
                    invoice_acc_id :invoiceEntry.invoice_acc_id,
                    invoice_year :invoiceEntry.invoice_year,
                    invoice_id :invoiceEntry.invoice_id
                  })
                }
                var days = (renewalObj[req.body.mode]);
                var expiry = new Date();
                var expiryDate = new Date(expiry.setDate(expiry.getDate() + days)).setHours(23,59,59,999);
                var invoiceObj, getBundleId = [];
                if(req.body.adjust_update){
                  if(req.body.base_bundle_updation){
                    invoiceObj = {
                      bund_name : req.body.updated_base_bundle.bundle_name,
                      mode      : req.body.mode,
                      quantity  : 1,
                      status    : 'Payment'
                    }
                    if(req.body.updated_base_bundle.bundle_type == custompackage) {
                      invoiceObj['amt'] = req.body.updated_base_bundle.bundle_cost;
                      invoiceObj['rate'] = req.body.updated_base_bundle.bundle_cost;
                    }else{
                      invoiceObj['amt'] = req.body.updated_base_bundle[month];
                      invoiceObj['rate'] = req.body.updated_base_bundle[month];
                    }
                    getBundleId.push(req.body.updated_base_bundle.bundle_id)
                    SubscriptionBundle.destroy({where:{base:true,bundle_id:req.body.exist_base_bundleid,subscription_id:req.body.subscription_id}}).then(function (delete_bundle) {
                     // SubscriptionPackage.destroy({where:{bundle_id:req.body.exist_base_bundleid}}).then(function (delete_pack) {
                        SubscriptionBundle.create({
                          retainer_invoice_id : response.id,
                          bundle_name         : req.body.updated_base_bundle.bundle_name,
                          bundle_id           : req.body.updated_base_bundle.bundle_id,
                          addon               : false,
                          base                : true,
                          non_iptv_status     : 'Active',
                          iptv                : req.body.updated_base_bundle.iptv,
                          org_id              : req.orgId,
                          subscription_id     : req.body.subscription_id
                        }).then(function (base_creation) {
                          SubscriptionBundle.update({addon_status:'cancel'},{where:{addon:true,subscription_id:req.body.subscription_id}}).then(function (update_cancel) {
                            
                          })
                        })
                     // })    
                    })
                  }
                  var id_list = [];
                  SubscriptionBundle.findOne({raw:true,where:{iptv:true,subscription_id:req.body.subscription_id}}).then(function(check_already_iptv){
                    var exist_iptv_flag = (check_already_iptv != null) ? true : false;
                    Subscription.findOne({where:{subscription_id:req.body.subscription_id},include:[SubscriptionBundle]}).then(function (customer) {
                      customer.subscription_bundles.map(function (ids) {
                        if(!ids.iptv){
                          id_list.push(ids.bundle_id);
                        }
                      })
                      Bundle.findAll({raw:true,where:{bundle_id:id_list}}).then(function (customer_bundle) {
                        invoiceEntry.invoices = [];
                        var all_bundle_ids = [];
                        function getAllInvoices(argument, cb) {
                          if(argument.length ==0){
                            cb(0)
                          }
                          argument.map(function (ip, count) {
                            all_bundle_ids.push(ip.bundle_id);
                            getBundleId.push(ip.bundle_id)
                            delete ip.id;
                            ip['retainer_invoice_id']=response.id;
                            if((ip.bundle_type == bundlepackage) && !req.body.base_bundle_updation && req.body.checkIptv && ip.iptv && !exist_iptv_flag) {
                              invoiceEntry.invoices.push({
                                bund_name : ip.bundle_name,
                                mode      : req.body.mode,
                                rate      : ip[month],
                                quantity  : 1,
                                status    : 'Payment',
                                amt       : ip[month]
                                // prorated_day : '- '+req.body.no_of_days+' days prorated',
                                // amt       : Number(((ip[month]/dayObj[req.body.mode]) * req.body.no_of_days).toFixed(2))
                              })
                            }else if((ip.bundle_type == bundlepackage) && !req.body.base_bundle_updation && req.body.checkIptv && ip.iptv && exist_iptv_flag) {
                              invoiceEntry.invoices.push({
                                bund_name : ip.bundle_name,
                                mode      : req.body.mode,
                                rate      : ip[month],
                                quantity  : 1,
                                status    : 'Payment',
                                prorated_day : '- '+req.body.no_of_days+' days prorated',
                                amt       : Number(((ip[month]/dayObj[req.body.mode]) * req.body.no_of_days).toFixed(2))
                              })
                            }else if(ip.bundle_type == bundlepackage) {
                              invoiceEntry.invoices.push({
                                bund_name : ip.bundle_name,
                                mode      : req.body.mode,
                                rate      : ip[month],
                                quantity  : 1,
                                status    : 'Payment',
                                amt       : ip[month]
                              })
                            }
                            if(ip.bundle_type == externalpackage) {
                              invoiceEntry.invoices.push({
                                bund_name : ip.bundle_name,
                                mode      : req.body.mode,
                                rate      : ip[month],
                                quantity  : 1,
                                status    : 'Payment',
                                amt       : ip[month]
                              })   
                            }
                            if((ip.bundle_type == custompackage) && !req.body.base_bundle_updation && req.body.checkIptv && ip.iptv && !exist_iptv_flag) {
                              invoiceEntry.invoices.push({
                                bund_name : ip.bundle_name,
                                mode      : req.body.mode,
                                rate      : ip.bundle_cost,
                                quantity  : 1,
                                status    : 'Payment',
                                amt       : ip.bundle_cost
                              })   
                            }else if((ip.bundle_type == custompackage) && !req.body.base_bundle_updation && req.body.checkIptv && ip.iptv && exist_iptv_flag) {
                              invoiceEntry.invoices.push({
                                bund_name : ip.bundle_name,
                                mode      : req.body.mode,
                                rate      : ip.bundle_cost,
                                quantity  : 1,
                                status    : 'Payment',
                                prorated_day : '- '+req.body.no_of_days+' days prorated',
                                amt       : Number(((ip.bundle_cost/dayObj[req.body.mode]) * req.body.no_of_days).toFixed(2))
                              })   
                            }else if(ip.bundle_type == custompackage) {
                              invoiceEntry.invoices.push({
                                bund_name : ip.bundle_name,
                                mode      : req.body.mode,
                                rate      : ip.bundle_cost,
                                quantity  : 1,
                                status    : 'Payment',
                                amt       : ip.bundle_cost
                              })   
                            }
                            if(!ip.iptv && req.body.stb && req.body.app) {
                              var arr_obj = {
                                bund_name : ip.bundle_name,
                                mode      : req.body.mode,
                                rate      : ip[month],
                                quantity  : 1,
                                status    : 'Payment',
                                // amt       : ip[month] - (ip[month]*oper.discount/100),
                                discount : oper.discount+ '% discount'
                              }
                              if(ip.bundle_type == externalpackage){
                                arr_obj['amt'] =  ip[month] - (ip[month]*oper.discount/100);
                              }
                              if((ip.bundle_type == custompackage) && !req.body.base_bundle_updation && req.body.checkIptv && ip.iptv && !exist_iptv_flag) {
                                arr_obj['amt'] =  ip.bundle_cost - (ip.bundle_cost*oper.discount/100);
                              }else if((ip.bundle_type == custompackage) && !req.body.base_bundle_updation && req.body.checkIptv && ip.iptv && exist_iptv_flag) {
                                arr_obj['prorated_day'] = '- '+req.body.no_of_days+' days prorated';
                                var amtPerDay = (ip[month]/dayObj[req.body.mode]);
                                var prorated_amt = (amtPerDay*req.body.no_of_days);
                                arr_obj['amt'] =  prorated_amt - (prorated_amt*oper.discount/100);
                              }else if(ip.bundle_type == custompackage){
                                arr_obj['amt'] =  ip.bundle_cost - (ip.bundle_cost*oper.discount/100);
                              }
                              if((ip.bundle_type == bundlepackage) && !req.body.base_bundle_updation && req.body.checkIptv && ip.iptv && !exist_iptv_flag) {
                                arr_obj['amt'] = ip[month]
                              } else if((ip.bundle_type == bundlepackage) && !req.body.base_bundle_updation && req.body.checkIptv && ip.iptv && exist_iptv_flag) {
                                arr_obj['prorated_day'] = '- '+req.body.no_of_days+' days prorated';
                                var amtPerDay = (ip[month]/dayObj[req.body.mode]);
                                var prorated_amt = (amtPerDay*req.body.no_of_days);
                                arr_obj['amt'] =  prorated_amt - (prorated_amt*oper.discount/100);
                              }else if(ip.bundle_type == bundlepackage){
                                arr_obj['amt'] = ip[month]
                              }
                              invoiceEntry.invoices.push(arr_obj)  
                            }
                            if(count+1 == (argument.length)){
                            cb(invoiceEntry);
                            }
                          })
                        }
                        getAllInvoices(req.body.newarr_on_edit, function (data) {
                          getAllInvoices(req.body.samearr_on_edit, function (datas) {
                             getAllInvoices(req.body.reupdatearr_on_edit, function (data_value) {
                              customer.subscription_bundles.map(function (arg) {
                                var filter = customer_bundle.filter(function (prop) {
                                  return (prop.bundle_id == arg.bundle_id)
                                })
                                if(!arg.iptv && req.body.stb && req.body.app && !customer.app){
                                  var arr_object = {
                                    bund_name : filter[0].bundle_name,
                                    mode      : req.body.mode,
                                    rate      : filter[0][month],
                                    quantity  : 1,
                                    status    : 'Payment',
                                    discount  : oper.discount+ '% discount'
                                  }
                                  if(filter[0].bundle_type == externalpackage){
                                    arr_object['amt'] =  filter[0][month] - (filter[0][month]*oper.discount/100);
                                  }
                                  if((filter[0].bundle_type == custompackage) && !req.body.base_bundle_updation && req.body.checkIptv && filter[0].iptv && !exist_iptv_flag) {
                                    arr_object['amt'] =  filter[0].bundle_cost - (filter[0].bundle_cost*oper.discount/100);
                                  }else if((filter[0].bundle_type == custompackage) && !req.body.base_bundle_updation && req.body.checkIptv && filter[0].iptv && exist_iptv_flag) {
                                      arr_object['prorated_day'] = '- '+req.body.no_of_days+' days prorated';
                                     var amtPerDay = (filter[0].bundle_cost/dayObj[req.body.mode]);
                                     var prorated_amt = (amtPerDay*req.body.no_of_days);
                                     arr_object['amt'] =  prorated_amt - (prorated_amt*oper.discount/100);
                                  } else if(filter[0].bundle_type == custompackage){
                                    arr_object['amt'] =  filter[0].bundle_cost - (filter[0].bundle_cost*oper.discount/100);
                                  }
                                  if((filter[0].bundle_type == bundlepackage) && !req.body.base_bundle_updation && req.body.checkIptv && filter[0].iptv && !exist_iptv_flag) {
                                    arr_object['amt'] =  filter[0][month] - (filter[0][month]*oper.discount/100);
                                  }else if((filter[0].bundle_type == bundlepackage) && !req.body.base_bundle_updation && req.body.checkIptv && filter[0].iptv && exist_iptv_flag) {
                                    arr_object['prorated_day'] = '- '+req.body.no_of_days+' days prorated';
                                    var amtPerDay = (filter[0][month]/dayObj[req.body.mode]);
                                    var prorated_amt = (amtPerDay*req.body.no_of_days);
                                    arr_object['amt'] =  prorated_amt - (prorated_amt*oper.discount/100);
                                  }else if(filter[0].bundle_type == bundlepackage){
                                    arr_object['amt'] =  filter[0][month] - (filter[0][month]*oper.discount/100);
                                  }
                                  invoiceEntry.invoices.push(arr_object)
                                }
                              })
                              if(req.body.account_balance != 0) {
                                invoiceEntry.invoices.push({
                                  mode      : req.body.mode,
                                  status    : 'Adjustment',
                                  amt       : req.body.account_balance
                                })
                              }
                              var subpack_new_arr = [], subpack_update_arr = [];
                              invoiceEntry.invoices.push(invoiceObj)
                              Transaction.create(invoiceEntry,{include:[Invoice]}).then(function(trans){
                                Transaction.bulkCreate(bulk_req).then(function(trans){
                                  SubscriptionBundle.bulkCreate(req.body.newarr_on_edit).then(function (create_new) {
                                    SubscriptionBundle.update({retainer_invoice_id:response.id},{where:{bundle_id:all_bundle_ids}}).then(function (update_retainer_id) {
                                      Subscription.update({retainer_invoice_id:response.id},{where:{subscription_id:req.body.subscription_id}}).then(function(update_sub){
                                        SubscriptionPackage.findAll({raw:true,where:{subscription_id:req.body.subscription_id}}).then(function (exist_package) {
                                          BundlePackage.findAll({raw:true,where:{bundle_id:getBundleId},attributes:{exclude:['id']}}).then(function (bundlepacks) {
                                            var old_packages=getPackages(exist_package);
                                            for (var i = bundlepacks.length - 1; i >= 0; i--) {
                                              var new_package=bundlepacks[i];
                                              var pack_id=new_package.package_id;
                                              new_package.createdAt = new Date();
                                              new_package.subscription_id = req.body.subscription_id;
                                              if(old_packages[pack_id]){
                                                new_package.expiry_date = expiryDate;
                                                subpack_update_arr.push(new_package)
                                              }else{
                                                if(!subpack_new_arr.some(function(item){ return (item.package_id===pack_id)})){
                                                  new_package.expiry_date = expiryDate;
                                                  subpack_new_arr.push(new_package)
                                                }
                                              }
                                            }
                                            SubscriptionPackage.bulkCreate(subpack_new_arr).then(function(create_sub_pack) {
                                              if(subpack_update_arr.length > 0){
                                                for (var i = 0; i < subpack_update_arr.length; i++) {
                                                  var pack_data = subpack_update_arr[i];
                                                  SubscriptionPackage.update(pack_data,{where:{package_id:pack_data.package_id,subscription_id:pack_data.subscription_id}}).then(function(update_sub_pack){
                                                    if((subpack_update_arr.length) == i){
                                                      res.status(200).send({url:url})
                                                    }
                                                  })
                                                }
                                              }else{
            res.status(200).send({url:url})
                }
                                            })
                                          })
                                        })
                                      })
                                    })
                                  })
                                })
                              })
                            })
                          })
                        })
                      })
                    })
                })
                }else if(!req.body.bulkCreate){
                  req.body.expires_on = expiryDate;
                  req.body.retainer_invoice_id = response.id
                  req.body.reseller_org_id = user.reseller_org_id
                  req.body.org_id = user.org_id
                  req.body.activated_on = new Date().setHours(0,0,0,0)

                  req.body.status = 'Pending'
                  var getBundleId = []
                  // if(!oper.enable_bundle_creation){
                    req.body.subscription_bundles.map(function(ip){
                      ip['retainer_invoice_id']=response.id
                      getBundleId.push(ip.bundle_id)
                      if(ip.add_on){
                        var inv_obj = {
                          bund_name : ip.bundle_name,
                          mode      : req.body.mode,
                          quantity  : 1,
                          status    : 'Payment'
                        }
                        if(ip.bundle_type == 'custompackage'){
                          inv_obj['rate']      = ip.bundle_cost;
                          inv_obj['amt']       = (ip.bundle_cost*1);
                        }else{
                          inv_obj['rate']      = ip[month];
                          inv_obj['amt']       = (ip[month]*1);
                        }
                        invoiceEntry.invoices.push(inv_obj)
                      }
                      if(!ip.iptv && req.body.app && req.body.stb) {
                        var inv_object = {
                          bund_name : ip.bundle_name,
                          mode      : req.body.mode,
                          quantity  : 1,
                          status    : 'Payment',
                          discount : oper.discount+ '% discount'
                        }
                        if(ip.bundle_type == 'custompackage'){
                          inv_object['rate']      = ip.bundle_cost;
                          inv_object['amt']       = ip.bundle_cost - (ip.bundle_cost*oper.discount/100);
                        }else{
                          inv_object['rate']      = ip[month];
                          inv_object['amt']       = ip[month] - (ip[month]*oper.discount/100);
                        }
                        invoiceEntry.invoices.push(inv_object) 
                      }  
                    })
                  // }
                  BundlePackage.findAll({raw:true,where:{bundle_id:getBundleId},attributes:{exclude:['id']}}).then(function (bundlepack) {
                    var bundlepack=bundlepack.filter(function(thing,index){
                      delete thing.id
                      return index === bundlepack.findIndex(function(obj){
                        return obj.package_id===thing.package_id;
                      });
                    });
                    bundlepack.map(function (bp) {
                      bp.expiry_date = expiryDate
                    })
                    req.body.subscription_packages = bundlepack;
                    Subscription.create(req.body,{include:[{model:SubscriptionBundle},{model:SubscriptionPackage}]}).then(function(subs){
                      Transaction.create(invoiceEntry,{include:[Invoice]}).then(function(invoice){
                        Transaction.bulkCreate(bulk_req).then(function(trans){
                          res.status(200).send({url:url})
                        })
                      })
                    },function(err){
                      if(err && err.errors[0].message) { return res.status(500).send(err.errors[0].message)} //DUPLICATE ENTRY FOR UNIQUE FIELD
                      res.status(500).send("Subscription creation failed");
                    })
                  })
                }else{
                  req.body.arr.map(function(arg){
                    arg.expires_on = expiryDate;
                    arg.activated_on = new Date().setHours(0,0,0,0);
                    arg.retainer_invoice_id = response.id;
                    arg.reseller_org_id = user.reseller_org_id;
                    arg.org_id = user.org_id;
                    arg.status = 'Pending';
                  })
                  req.body.status = 'Pending';
                  var dupeArr = [];
                  Subscription.findAll({raw:true}).then(function(checkSubs){
                    req.body.arr.map(function(input){
                      if (checkSubs.some(function (item){return((item.email == input.email) || (item.mobile == input.mobile)) })){
                        dupeArr.push(input)
                      }
                    })
                    if(dupeArr.length > 0){
                      res.status(500).send({dupe:dupeArr});
                    }else{
                      req.body.arr.map(function(ele){
                        ele.mobile = ele.mobile.replace('\r', '')
                      })
                      var bulkfinal = [];
                      if(req.body.add_on){
                        var subscription=req.body.arr
                        var bundles=req.body.subscription_bundles
                        var sub_id = []
                        for (var i = 0; i < subscription.length; i++) { 
                          var sub_index=subscription[i]
                          sub_id.push(sub_index.subscription_id);
                          sub_index.status = 'New';  
                          sub_index.org_id = user.org_id;
                          sub_index.reseller_org_id = user.reseller_org_id;
                          sub_index.expires_on = expiryDate;
                          var subscription_id=sub_index.subscription_id;
                          for (var j = 0; j < bundles.length; j++) {   
                            var bundle_index=bundles[j]
                            delete bundle_index.id
                            bundle_index.subscription_id=subscription_id    
                            var copied_bundle = Object.assign({}, bundle_index);    
                            bulkfinal.push(copied_bundle)
                          }
                        }
                        var getBundleId = [];
                        req.body.subscription_bundles.map(function(ip){
                          ip.retainer_invoice_id = response.id;
                          getBundleId.push(ip.bundle_id);
                          // if(!oper.enable_bundle_creation){
                            if(ip.add_on){
                              var inv_object = {
                                bund_name : ip.bundle_name,
                                mode      : req.body.mode,
                                quantity  : req.body.arr.length,
                                status    : 'Payment'
                              }
                              if(ip.bundle_type == 'custompackage'){
                                inv_object['rate']      = ip.bundle_cost;
                                inv_object['amt']       = (ip.bundle_cost*req.body.arr.length);
                              }else{
                                inv_object['rate']      = ip[month];
                                inv_object['amt']       = (ip[month]*req.body.arr.length);
                              }
                              invoiceEntry.invoices.push(inv_object)
                            }
                            if(!ip.iptv && req.body.arr[0].stb && req.body.arr[0].app) {
                              var inv_obj = {
                                bund_name : ip.bundle_name,
                                mode      : req.body.mode,
                                quantity  : req.body.arr.length,
                                status    : 'Payment',
                                discount  : oper.discount+ '% discount'
                              }
                              if(ip.bundle_type == 'custompackage'){
                                inv_obj['rate']      = ip.bundle_cost;
                                inv_obj['amt']       = ((ip.bundle_cost - (ip.bundle_cost*oper.discount/100)) *req.body.arr.length);
                              }else{
                                inv_obj['rate']      = ip[month];
                                inv_obj['amt']       = ((ip[month] - (ip[month]*oper.discount/100)) *req.body.arr.length);
                              }
                              invoiceEntry.invoices.push(inv_obj) 
                            }
                          // }
                        })
                        bulkfinal.map(function(ele){
                          if(ele.add_on)
                          ele['retainer_invoice_id'] = response.id
                        })
                      }else{
                        var getBundleId = [], sub_id = [];
                        req.body.arr.map(function(arg){
                          sub_id.push(arg.subscription_id);
                          req.body.subscription_bundles.map(function (argument) {
                            argument.retainer_invoice_id = response.id
                            getBundleId.push(argument.bundle_id)
                            var copied_bundle = Object.assign({}, argument);
                            copied_bundle.subscription_id = arg.subscription_id
                            bulkfinal.push(copied_bundle)
                          })
                        })
                      }
                      BundlePackage.findAll({raw:true,where:{bundle_id:getBundleId},attributes:{exclude:['id','createdAt','updatedAt']}}).then(function (bundlepack) {
                        var bundlepack=bundlepack.filter(function(thing,index){
                          delete thing.id
                          return index === bundlepack.findIndex(function(obj){
                            return obj.package_id===thing.package_id;
                          });
                        });
                        var subPackArr = [];
                        sub_id.map(function (property) {
                          bundlepack.map(function (bp) {
                            bp.expiry_date = expiryDate
                            bp.subscription_id = property
                            var copied_pack = Object.assign({}, bp);   
                            subPackArr.push(copied_pack)
                          })
                        })
                        Subscription.bulkCreate(req.body.arr).then(function(subs){
                          SubscriptionBundle.bulkCreate(bulkfinal).then(function (sub_bundle) {
                            SubscriptionPackage.bulkCreate(subPackArr).then(function (sub_pack) {
                              Transaction.create(invoiceEntry,{include:[Invoice]}).then(function(invoice){
                                Transaction.bulkCreate(bulk_req).then(function(trans){
                                  res.status(200).send({url:url})
                                })
                              })
                            })
                          })
                        },function(err){
                          if(err && err.errors[0].message) { return res.status(500).send(err.errors[0].message)} //DUPLICATE ENTRY FOR UNIQUE FIELD
                          res.status(500).send("Subscription creation failed");
                        })
                      })
                    }
                  })
                }
                })
              }else{
                res.status(500).send("Problem in invoice creation ,try after sometime")
              }
            }
          })
        })
      })
    })
  })
})

router.post('/manualRenewal', VerifyToken, function (req, res) {
  User.findOne({raw:true,where:{user_id:req.userId}}).then(function(user){
    Bundle.findAll({raw:true}).then(function(bundle){
      totalBundle = bundle;
      BundlePackage.findAll({raw:true}).then(function(bundlepack){
        totalBundlePack = bundlepack;
        SubscriptionPackage.findAll({raw:true}).then(function (subscription_package) {
          totalSubscriptionPack = subscription_package;
          OperatorSetting.findOne({raw:true,where:{org_id:user.org_id}}).then(function(oper){
            var date = new Date();
            var firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
            var obj = {org_id:oper.org_id,status:'Approved',time_stamp: { [Op.between]: [firstDay, date]}}
            var amount = {};
            creditCalculation.Calculate(obj ,cb)
            function cb(data){
              if((data.status == 200) && (data.msg.status == 'success')){
                var availables = data.msg.object.toFixed(2);
                Subscription.findAll({
                  where:{subscription_id:req.body.id_array},
                  include:[{
                    model : SubscriptionBundle,
                    attributes:{exclude:['id']}
                  }]
                }).then(function(subscription){
                  makeManualRenewal(subscription,availables,totalBundle,oper.ncf_bundle_id,oper,totalBundlePack,user,totalSubscriptionPack);
                })
              }
            }
          },function(err){
            D && console.log("Problem in finding operator_setting")
          })
        })
      })
    })
  })
  function makeManualRenewal(subscription,availables,totalBundle,ncf_bundle_id,oper,totalBundlePack,getUser,totalSubscriptionPack){
    Provider.findAll({raw:true,where:{iptv:true}}).then(function(providers){
    if(subscription.length > 0){
      var renewalArrId = []
      var amt_with_gst = 0, finalAmt = 0;
      var bundle_cost;
      var renewalDb = [], renewalArr = [];
      for (var i = 0; i < subscription.length; i++) {
        (function(sub,index){
          var new_sub_bundle = []
          var amt = 0;
          var ott_amt = 0;
          var month = keyObj[sub.mode];
          var sub_bundle = sub.subscription_bundles[0];
          var ncfBundle;
          var iptvFlag = false;
          var ncf_cost = 0;
          var bundleList=sub.get({plain:true});
          bundleList.subscription_bundles.map(function (data) {
            if (((data.iptv == 'true') || (data.iptv == true)) && ((data.addon_status == 'true') || (data.addon_status == true))){
              iptvFlag = true
            }
          })
          var packArr = [];
          sub.subscription_bundles.map(function (argument, count) {
            var days = (renewalObj[sub.mode]) 
            var expiry = new Date();
            var start_date = (new Date(expiry)).getTime()+1*24*60*60*1000;//next date of current sale expire date
            var updated_start_date = new Date(start_date).setHours(0,0,0,0);
            var new_updated_date = new Date(updated_start_date)
            var updated_end_date = new Date(new_updated_date.setDate(new_updated_date.getDate()+ days)).setHours(23,59,59,999);
            var bundlefilter = totalBundle.filter(function (prop) {
              return (prop.bundle_id == argument.bundle_id)
            })
            var packfilter = totalSubscriptionPack.filter(function (prop) {
              return ((prop.bundle_id == argument.bundle_id) && ((prop.subscription_id == argument.subscription_id)))
            })
            if((!argument.base) && ((argument.addon_status == 'true') || (argument.addon_status == true)) && (argument.bundle_id == ncf_bundle_id) && iptvFlag){
              ncf_cost = bundle_cost;
              ncfBundle = argument;
            }
            packfilter.map(function(prop){
              prop.expiry_date = updated_end_date;
            })
            packArr = [...packArr, ...packfilter];
            if (bundlefilter[0].bundle_type == 'custompackage') {
              bundle_cost = bundlefilter[0].bundle_cost;
            } else {
              bundle_cost = bundlefilter[0][month];
            }

            if(!argument.iptv && sub.stb && sub.app){
              ott_amt = ott_amt + bundle_cost;
            }
            if(argument.base){
              amt = amt + bundle_cost;
              new_sub_bundle.push(argument);
            }
            if(count+1 == sub.subscription_bundles.length){
              if(iptvFlag){
                var ncf = totalBundle.filter(function (prop) {
                  return (prop.bundle_id == ncf_bundle_id)
                })
                amt = amt + ncf[0][month];
                new_sub_bundle.push(ncfBundle);
              }
              amt_with_gst = Number((((amt*18)/100) + amt).toFixed(2));
              var ott_amt_with_gst = Number((ott_amt+((ott_amt*18)/100)).toFixed(2));
              amt_with_gst = Number((amt_with_gst + (ott_amt_with_gst-((ott_amt_with_gst*oper.discount)/100))).toFixed(2));
              // var current_amt = finalAmt + amt_with_gst;
              // if(availables >= current_amt){
                // finalAmt = finalAmt + amt_with_gst;
                sub.activated_on = updated_start_date;
                sub.expires_on=  updated_end_date;
                var sub_data = {
                  subscription_id: sub.subscription_id,
                  org_id: sub.org_id,
                  reseller_org_id: sub.reseller_org_id,
                  name: sub.name,
                  mobile: sub.mobile,
                  email: sub.email,
                  bundle: sub.bundle,
                  mode: sub.mode,
                  activated_on: sub.activated_on,
                  expires_on: sub.expires_on,
                  status:'Active',
                  serial_no: sub.serial_no,
                  autorenewal: sub.autorenewal,
                  amount: sub.amount,
                  is_new: sub.is_new,
                  checkIptv:sub.checkIptv,
                  stb_type:sub.stb_type,
                  mac_address:sub.mac_address,
                  stb: sub.stb,
                  app: sub.app,
                  subscription_package: packArr,
                  subscription_bundles: new_sub_bundle
                }
                renewalArr.push(sub_data);
                renewalArrId.push(sub.subscription_id);
              // }
            }
          })
        })(subscription[i],i);
      }
      var invoiceEntry = {
        org_id          : oper.org_id,
        org_name        : oper.org_name,
        reseller_org_id : oper.reseller_org_id,
        type            : 'Debit',
        status          : 'Approved',
        payment_method  : 'Offline',
        criteria        : 'Direct',
        total_amount    : amt_with_gst,
        invoices        : []
      }
      var obj = {}, name = '', app_obj = {};
      renewalArr.map(function(item){
        var month = item.mode;
        item.subscription_bundles.map(function(prop){
          var ott_bundle = totalBundle.filter(function (arg) {
          return (prop.bundle_id == arg.bundle_id)
        })
          var is_app = item.app ? true : false;
          if(prop){
            if(obj[prop.bundle_id] == undefined){
            name = (name=='')?prop.bundle_name:name+', '+prop.bundle_name;
              obj[prop.bundle_id] = {};
              obj[prop.bundle_id][month] = 1;
              app_obj[prop.bundle_id] = {};
              app_obj[prop.bundle_id][month] = (is_app && !ott_bundle[0].iptv) ? 1 : 0;
            }else{
              if(obj[prop.bundle_id][month] == undefined){
                obj[prop.bundle_id][month] = 1;
                app_obj[prop.bundle_id][month] = (is_app && !ott_bundle[0].iptv) ? 1 : 0;
              }else{
                obj[prop.bundle_id][month] = obj[prop.bundle_id][month] + 1;
                app_obj[prop.bundle_id][month] = app_obj[prop.bundle_id][month] + 1;
              }
            }
          }
        })
      })
      for (var i in app_obj){
        var filter = totalBundle.filter(function (prop) {
          return (prop.bundle_id == i);
        })
        if (filter[0].bundle_type == 'custompackage') {
          bundle_cost = filter[0].bundle_cost;
        } else{
          bundle_cost = filter[0][data];
        }
        var object = app_obj[i];
        for (var j in object) {
          var data = keyObj[j];
          if(!filter[0].iptv && (object[j] > 0)) {
            invoiceEntry.invoices.push({
              bund_name : filter[0].bundle_name,
              mode      : j,
              rate      : filter[0][data],
              quantity  : object[j],
              status    : 'Payment',
              amt       : ((bundle_cost - (bundle_cost*oper.discount/100))*object[j]),
              discount  : oper.discount+ '% discount'
            }) 
          }
        }
      }
      Transaction.findOne({raw:true,where:{invoice_year:new Date().getFullYear()},order:[['trans_id','DESC']],limit:1}).then(function(trans){
        if(trans){
          if(trans.invoice_year == new Date().getFullYear()){
            invoiceEntry.invoice_acc_id = trans.invoice_acc_id + 1
            invoiceEntry.invoice_year = new Date().getFullYear()
            invoiceEntry.invoice_id = 'INV-'+invoiceEntry.invoice_year+'AC'+invoiceEntry.invoice_acc_id
          }else{
            invoiceEntry.invoice_acc_id = 1
            invoiceEntry.invoice_year = new Date().getFullYear()
            invoiceEntry.invoice_id = 'INV-'+invoiceEntry.invoice_year+'AC'+invoiceEntry.invoice_acc_id
          }
        }else{
          invoiceEntry.invoice_acc_id = 1
          invoiceEntry.invoice_year = new Date().getFullYear()
          invoiceEntry.invoice_id = 'INV-'+invoiceEntry.invoice_year+'AC'+invoiceEntry.invoice_acc_id
        }
      })
      if(availables >= amt_with_gst) {
        invoiceEntry.invoices.push({
          bund_name : name,
          mode      : 'multiple_mode',
          status    : 'Adjustment',
          amt       : amt_with_gst
        })
        var finalArr = [];
      var saleArr = [];
      renewalArr.map(function(arg){
        finalArr.push({
          subscription_id: arg.subscription_id,
          org_id: arg.org_id,
          reseller_org_id: arg.reseller_org_id,
          name: arg.name,
          mobile: arg.mobile,
          email: arg.email,
          bundle: arg.bundle,
          mode: arg.mode,
          activated_on: arg.activated_on,
          expires_on: arg.expires_on,
          status:arg.status,
          serial_no: arg.serial_no,
          autorenewal: arg.autorenewal,
          amount: arg.amount,
          is_new: arg.is_new,
          checkIptv:arg.checkIptv,
          stb_type:arg.stb_type,
          mac_address:arg.mac_address,
          stb: arg.stb,
          app: arg.app
        });
        var salepackages = [];
        (arg.subscription_bundles).map(function(proc){
          if(proc && !proc.bundle_name.includes('NCF') && proc.iptv){
            var packages = totalBundlePack.filter(function (entry) {
              delete entry.id;
              delete entry.createdAt
              delete entry.updatedAt
              entry.status = 'COMPLETED';
                      entry.start_date   = arg.activated_on;
              return (entry.bundle_id == proc.bundle_id);
            })
            salepackages = [...salepackages,...packages]
          } 
        })
        if(arg.checkIptv){
          saleArr.push({
            customer_id     : arg.subscription_id,
            activation_code   : arg.serial_no.split("-")[0],
            customer_email    : arg.email,
            customer_firstname  : arg.name,
            start_date      : arg.activated_on,
            end_date      : arg.expires_on,
            is_active       : 0,
            status        : 'ACTIVE',
            user_id       : getUser.user_id,
            customer_id     : arg.subscription_id,
            is_auto_renew     : arg.autorenewal,
            unique_id       : arg.serial_no,
            salespackages     : salepackages
          })
        }
      })
      function sms_call(){
        if(saleArr.length > 0 && saleArr[0].salespackages.length >0){
          var provider_data = providers.filter(function (entry) {
            return (entry.provider_id == saleArr[0].salespackages[0].provider_id);
          })
          var provider = provider_data[0];
          var sms_payload = {
            saleArr: saleArr
          }
          var obj=HTTPCli.M2MReq(provider.sms_host,provider.sms_port,'POST',sms_payload,'/api/partner/renewal',provider.sms_token);
          HTTPCli.https_to_SMS(obj,sucess_cb,error_cb);
          function error_cb(err){
            sms_payload['sms_host'] = provider.sms_host;
            sms_payload['sms_port'] = provider.sms_port;
            sms_payload['sms_token'] = provider.sms_token;
            sms_payload['api'] = '/api/partner/renewal';
            var retry_key = 'payload'+random_number(options);
            sms_payload['retry_key'] = retry_key;
            sms_retry.set(retry_key, sms_payload);
            sms_retry.save();
          }
          function sucess_cb(data){
            D && console.log("sucess",data);
          }
        }
      }
        Transaction.create(invoiceEntry,{include:[Invoice]}).then(function(trans){
          function sub_pack_update(renewalSubPack) {
            if(renewalSubPack.subscription_package.length > 0){
              for (var i = 0; i < renewalSubPack.subscription_package.length; i++) {
                var packData = renewalSubPack.subscription_package[i];
                SubscriptionPackage.update(packData,{where:{subscription_id:renewalSubPack.subscription_id, package_id:packData.package_id }}).then(function (subscription_pack) {
                })
              }
            }
          }
          if(renewalArr.length > 0){
            for (var i = 0; i < renewalArr.length; i++) {
              (function(data_obj, count) {
                  sub_pack_update(data_obj);
                  Subscription.update(data_obj,{where:{subscription_id:data_obj.subscription_id}}).then(function (subscription) {
                    if(count+1 == renewalArr.length){
                      sms_call()
                      res.status(200).send("Subscription Renewed Successfully");
                    }
                  })
              })(renewalArr[i], i);
            }
          }
        })
      }else{
        BillSetting.findOne({raw:true}).then(function(payment_details){
          Org.findOne({raw:true,where:{org_id:getUser.org_id}}).then(function(org){
            invoiceEntry.invoices.push({
              bund_name : name,
              mode      : 'multiple_mode',
              status    : 'Adjustment',
              amt       : availables
            })
            var amt_to_pay = Number((amt_with_gst-availables).toFixed(2));
            var callback_url  = req.body.redirection_url+"?is_manual_renewal=true/#/admin/subscription";
            const payload = {
              amount: Number((amt_to_pay*100).toFixed(2)),
              currency: "INR",
              customer: {
                "name": org.org_name,
                "email": org.report_email,
                "contact": 91 + org.phone_no
              },
              notify: {
                sms: true,
                email: true
              },
              callback_url: callback_url,
              callback_method: "get"
            };
            invoiceEntry.status = 'Pending';
            Razorpay.createPaymentLink(payload,payment_details,function(response){
              if(response){
                var url=response.short_url.replace(/<[^>]*>/g, '')
                if(url){
                  invoiceEntry.retainer_invoice_id = response.id;
                  invoiceEntry.paid_amount = amt_to_pay;
                  invoiceEntry.total_amount = amt_to_pay;
                  var bulk_req = [
                    {
                      org_id              : org.org_id,
                      org_name            : org.org_name,
                      reseller_org_id     : org.reseller_org_id,
                      type                : 'Credit',
                      criteria            : 'Direct',
                      status              : 'Pending',
                      payment_method      : 'Online',
                      bundle              : name,
                      total_amount        : amt_to_pay,
                      paid_amount         : amt_to_pay,
                      retainer_invoice_id : response.id,
                      invoice_acc_id      : invoiceEntry.invoice_acc_id,
                      invoice_year        : invoiceEntry.invoice_year,
                      invoice_id          : invoiceEntry.invoice_id
                    }
                  ]
                  if(availables != 0){
                    bulk_req.unshift({
                      org_id              : org.org_id,
                      org_name            : org.org_name,
                      reseller_org_id     : org.reseller_org_id,
                      type                : 'Debit',
                      criteria            : 'Direct',
                      status              : 'Pending',
                      payment_method      : 'Online',
                      bundle              : name,
                      total_amount        : availables,
                      paid_amount         : availables,
                      retainer_invoice_id : response.id,
                      invoice_acc_id      : invoiceEntry.invoice_acc_id,
                      invoice_year        : invoiceEntry.invoice_year,
                      invoice_id          : invoiceEntry.invoice_id
                    })
                  }
                  Subscription.update({retainer_invoice_id:response.id},{where:{subscription_id:renewalArrId}}).then(function(subscriber){
                    SubscriptionBundle.update({retainer_invoice_id:response.id},{where:{subscription_id:renewalArrId}}).then(function(sub_bundles){
                      Transaction.create(invoiceEntry,{include:[Invoice]}).then(function(trans){
                        Transaction.bulkCreate(bulk_req).then(function(trans){
                          res.status(200).send({url:url})
                        })
                      })
                    })
                  })
                }
              }
            })
          })
        })
      }
    }
  })
  }
})

router.get('/:status/:limit/:offset', VerifyToken, function (req, res) {
  User.findOne({raw:true,where:{user_id:req.userId}}).then(function(user){
    if(user.roles == 'ADMIN'){
      var obj = {}
    }else {
      var obj = {org_id:user.org_id}
      if((req.params.status == 'Deactive') || (req.params.status == 'Active') || (req.params.status.toLowerCase()=='inactive')){
        obj = {
          org_id:user.org_id,
          status: req.params.status
        }
      }else if( req.params.status == 'Expires Today'){
        obj = {
          org_id:user.org_id,
          expires_on : new Date(new Date()).setHours(23,59,59,999)
        }
      }else if(req.params.status.toLowerCase()=='new'){
        obj = {
          org_id:user.org_id,
          status: ['New','Active']
        }
      }
    }
    var limit = req.params.limit;
    var off = (req.params.offset == 0) ? 0 : (req.params.offset -1) * limit

    Subscription.findAndCountAll({where:obj,limit:Number(limit),offset:Number(off),include:[{model:AccessLogin},{model:SubscriptionBundle},{model:Org,as:'subscriberOrg'}],order:[['createdAt','DESC']]}).then(function(all_type_info) {
      if(all_type_info.rows.length > 0) {
        getTotalPages(all_type_info,limit,function (obj) {
          res.status(200).send(obj)   
        });
      }else{
        res.status(200).send({ count: 0, rows: [] })
      }
    },
    function(err){
      res.status(500).send("Problem in finding Subscription");
    })
  })
});

router.post('/search',VerifyToken, function (req, res) {
  User.findOne({raw:true,where:{user_id:req.userId}}).then(function (user) {
    var term = req.body.term
    var input = '%'+term+'%'
    var obj = {
      [Op.or]: [
        {name:{[Op.like]:input}},
        {mobile:{[Op.like]:input}},
        {email:{[Op.like]:input}},
        {mode:{[Op.like]:input}},
        {bundle:{[Op.like]:input}},
        {status:{[Op.like]:input}},
        {serial_no:{[Op.like]:input}},
        {mac_address:{[Op.like]:input}}
      ]
    }
    if((user.roles == 'OPERATOR') || (user.roles == 'RESELLER')){
      obj.org_id = user.org_id
    }
    var limit = req.body.limit;
    var off = (req.body.offset == 0) ? 0 : (req.body.offset -1) * limit
    Subscription.findAndCountAll({where:obj,limit:Number(limit),offset:Number(off),include:[{model:AccessLogin},{model:SubscriptionBundle},{model:Org,as:'subscriberOrg'}], order:[['createdAt','DESC']]}).then(function(all_type_info) {
      if(all_type_info.rows.length > 0) {
        getTotalPages(all_type_info,limit,function (obj) {
          res.status(200).send(obj)   
        });
      }else{
        res.status(200).send({ count: 0, rows: [] })
      }
    },
    function(err){
      res.status(500).send("Problem in finding Subscription");
    })
  })
})

router.get('/:bundle/:mode', VerifyToken, function (req, res) {
  Subscription.findAll({raw: true,where:{bundle:req.params.bundle,mode:req.params.mode}}).then(function(customer) {
    res.status(200).send(customer);   
  },function(err){
    res.status(500).send("Problem in finding Subscription");
  })
});

router.get('/', VerifyToken, function (req, res) {
  EMM.findAll({raw:true,where:{org_id:req.orgId,status:['Fresh','Deactive','Inactive']}}).then(function(emm){
    return res.status(200).send(emm)
  },function(err){
    return res.status(500).send("There was a problem to find the EMM details")
  })
});

function updateBundle(bundle_name,subscription_id,org_id){
 Bundle.findOne({raw:true,where:{bundle_name:bundle_name}}).then(function (get_base) {
        SubscriptionBundle.create({
          bundle_name         : bundle_name,
          bundle_id           : get_base.bundle_id,
          addon               : false,
          base                : true,
          non_iptv_status     : 'Active',
          iptv                : false,
          org_id              : org_id,
          subscription_id     : subscription_id
        }).then(function (initial_creation) {
        })
      })

}

router.post('/update_sb',function(req,res){
  var org_name=req.body.org_name;
  Org.findOne({raw:true,where:{org_name:org_name}}).then(function(org_info){
    if(org_info){
      var org_id=org_info.org_id;
      Subscription.findAll({where:{org_id:org_id},include:[SubscriptionBundle]}).then(function(subscription){
        if(subscription && subscription.length>0){
          for(var i=0;i<subscription.length;i++){
          var sub=subscription[i]
          if(sub.subscription_bundles.length==0){
            updateBundle(sub.bundle,sub.subscription_id,sub.org_id)
          }
          }
          res.status(200).send(subscription);
        }else{
          res.status(500).send('No subscription found');
        }
      })
    }else{
      res.status(200).send("No org found");
    }
  })
})

router.put('/:subscription_id' ,VerifyToken, function (req, res) {
  req.body.mac_address = req.body.mac_address.trim();
  var id_list = [], sms_ids = [];
  var external_bundle_ids = [];

  if(req.body.serial_no == ''){
    delete req.body.serial_no;
  } 
  req.body.mac_address = req.body.mac_address.trim();

  var iptv_expiry_date = '', iptv_expiry_id = '';
  if(req.body.bundle.iptv){
    iptv_expiry_date = req.body.expires_on
    sms_ids.push(req.body.bundle.bundle_id)
  }
  var month = keyObj[req.body.mode];
  var days = (renewalObj[req.body.mode]);
  var expiry = new Date(); 
  var expiryDate = new Date(expiry.setDate(expiry.getDate() + days)).setHours(23,59,59,999);
  if (req.body.is_iptv && !req.body.ncf_already_added) {
    req.body.ncf_bundle['addon']        = true;
    req.body.ncf_bundle['base']         = false;
    req.body.ncf_bundle['addon_status'] =  'progress';
    req.body.org_id = req.orgId;
    req.body.newarr.push(req.body.ncf_bundle)
  }
  if(!req.body.is_iptv && req.body.ncf_already_added){
    req.body.delarr.push(req.body.ncf_bundle.bundle_id)
  }
  if(req.body.is_iptv && req.body.ncf_already_added){
    req.body.reupdatearr.push(req.body.ncf_bundle.bundle_id)
  }
   EMM.update({status:'Active'},{where:{unique_id:req.body.serial_no}}).then(function(updated_emm){                                                                                                                                                                     
  }); 
  if(req.body.newarr.length == 0){
    SubscriptionBundle.findOne({raw:true,where:{subscription_id:req.body.subscription_id,base:true}}).then(function (get_base_bundle) {
      SubscriptionPackage.findAll({raw:true,where:{subscription_id:req.body.subscription_id,bundle_id:get_base_bundle.bundle_id}}).then(function (get_base_pack) {
      })
    })                        
  }
  Subscription.findOne({where:{subscription_id:req.params.subscription_id},include:[SubscriptionBundle]}).then(function (customer) {
    customer.subscription_bundles.map(function (ids) {
      if(!ids.iptv){
        id_list.push(ids.bundle_id);
      }
      if(ids.iptv && (iptv_expiry_date == '') && (iptv_expiry_id == '')){
        iptv_expiry_id = ids.bundle_id;
      }
    })
    if((iptv_expiry_date == '') && (iptv_expiry_id != '')){
      SubscriptionPackage.findOne({raw:true,where:{bundle_id:iptv_expiry_id,subscription_id:req.params.subscription_id}}).then(function function_name(get_expiry_date) {
        if(get_expiry_date!=null){
          iptv_expiry_date = get_expiry_date.expiry_date;
        }else{
          var iptv_days = (renewalObj["One Month"]);
          var expiry = new Date()
          var one_month_expiry_date = new Date(expiry.setDate(expiry.getDate() + iptv_days)).setHours(23,59,59,999);
          iptv_expiry_date = one_month_expiry_date;
        }
      },function (err) {
      })
    }else{
      var iptv_days = (renewalObj["One Month"]);
      var expiry = new Date()
      var one_month_expiry_date = new Date(expiry.setDate(expiry.getDate() + iptv_days)).setHours(23,59,59,999);
      iptv_expiry_date = one_month_expiry_date;
    } 
    var invoiceObj;
    req.body.base_bundle = req.body.bundle
    var getBundleId =[], add_on_without_gst = 0;
    // SubscriptionPackage.findOne({raw:true,where:{bundle_id:iptv_expiry_id}}).then(function function_name(get_expiry_date) {
      Bundle.findAll({raw:true,where:{bundle_id:id_list}}).then(function (customer_bundle) {
        OperatorSetting.findOne({raw:true,where:{org_id:customer.org_id}}).then(function (oper) {
          SubscriptionBundle.findOne({raw:true,where:{subscription_id:req.params.subscription_id,base:true}}).then(function (check_base_bun){
            if(!check_base_bun){
              Bundle.findOne({raw:true,where:{bundle_name:req.body.bundle}}).then(function (get_base) {
                SubscriptionBundle.create({
                  bundle_name         : req.body.bundle,
                  bundle_id           : get_base.bundle_id,
                  addon               : false,
                  base                : true,
                  non_iptv_status     : 'Active',
                  iptv                : get_base.iptv,
                  org_id              : req.orgId,
                  subscription_id     : req.params.subscription_id
                }).then(function (initial_creation) {
                })
              })
            }
            if(req.body.base_bundle_updation){
              invoiceObj = {
                bund_name : req.body.base_bundle.bundle_name,
                mode      : req.body.mode,
                quantity  : 1,
                status    : 'Payment'
              }
              if(req.body.base_bundle.bundle_type == custompackage) {
                add_on_without_gst = add_on_without_gst + req.body.base_bundle.bundle_cost;
                invoiceObj['amt'] = req.body.base_bundle.bundle_cost;
                invoiceObj['rate'] = req.body.base_bundle.bundle_cost;
              }else{
                add_on_without_gst = add_on_without_gst + req.body.base_bundle[month];
                invoiceObj['amt'] = req.body.base_bundle[month];
                invoiceObj['rate'] = req.body.base_bundle[month];
              }
        if(req.body.bundle.is_external_packages){
                 external_bundle_ids.push(req.body.bundle.bundle_id)
              }
             }
             var reupdate_invoice_arr = [], samearr_on_edit = [], reupdatearr_on_edit = [];
             if((req.body.reupdatearr.length>0) && (req.body.update_and_renew)){
                req.body.reupdatearr.map(function (reupdate_bundle){
                  var bundle_filter = customer_bundle.filter(function (props) {
                    return (props.bundle_id == reupdate_bundle)
                  })
                  reupdatearr_on_edit.push(bundle_filter[0])
                  if(bundle_filter.length>0){
                    reInvoiceObj = {
                      bund_name : bundle_filter[0].bundle_name,
                      mode      : req.body.mode,
                      quantity  : 1,
                      status    : 'Payment'
                    }
                    if(bundle_filter[0].bundle_type == custompackage) {
                      add_on_without_gst = add_on_without_gst + bundle_filter[0].bundle_cost;
                      reInvoiceObj['amt'] = bundle_filter[0].bundle_cost;
                      reInvoiceObj['rate'] = bundle_filter[0].bundle_cost;
                    }else{
                      add_on_without_gst = add_on_without_gst + bundle_filter[0][month];
                      reInvoiceObj['amt'] = bundle_filter[0][month];
                      reInvoiceObj['rate'] = bundle_filter[0][month];
                    }
                    reupdate_invoice_arr.push(reInvoiceObj)
                  }
                })
              }
             if((req.body.samearr.length>0) && (req.body.update_and_renew)){
                req.body.samearr.map(function (samearr_bundle){
                  var bundle_filter = customer_bundle.filter(function (props) {
                    return (props.bundle_id == samearr_bundle)
                  })
                  samearr_on_edit.push(bundle_filter[0])
                  if(bundle_filter.length > 0){
                      reInvoiceObj = {
                        bund_name : bundle_filter[0].bundle_name,
                        mode      : req.body.mode,
                        quantity  : 1,
                        status    : 'Payment'
                      }
                      if(bundle_filter[0].bundle_type == custompackage) {
                        add_on_without_gst = add_on_without_gst + bundle_filter[0].bundle_cost;
                        reInvoiceObj['amt'] = bundle_filter[0].bundle_cost;
                        reInvoiceObj['rate'] = bundle_filter[0].bundle_cost;
                      }else{
                        add_on_without_gst = add_on_without_gst + bundle_filter[0][month];
                        reInvoiceObj['amt'] = bundle_filter[0][month];
                        reInvoiceObj['rate'] = bundle_filter[0][month];
                      }
                      reupdate_invoice_arr.push(reInvoiceObj)
                    }
                })
              }
              function subscription_create_destroy(){
                getBundleId.push(req.body.base_bundle.bundle_id)
                SubscriptionBundle.destroy({where:{base:true,bundle_id:req.body.exist_base_bundleid,subscription_id:req.params.subscription_id}}).then(function (delete_bundle) {
                SubscriptionBundle.create({
                  bundle_name         : req.body.base_bundle.bundle_name,
                  bundle_id           : req.body.base_bundle.bundle_id,
                  addon               : false,
                  base                : true,
                  non_iptv_status     : 'Active',
                  iptv                : req.body.base_bundle.iptv,
                  org_id              : req.orgId,
                  subscription_id     : req.params.subscription_id
                }).then(function (base_creation) {
                  SubscriptionBundle.update({addon_status:'cancel'},{where:{addon:true,subscription_id:req.params.subscription_id}}).then(function (update_cancel) {
                    SubscriptionBundle.update({addon_status:'true'},{where:{bundle_id:req.body.reupdatearr,subscription_id:req.params.subscription_id}}).then(function (reupdate) {
                      SubscriptionBundle.update({addon_status:'true'},{where:{bundle_id:req.body.samearr,subscription_id:req.params.subscription_id}}).then(function (reupdate) {
                      })
                    })
                  })
                })
                })
              }           
            var app_flag = req.body.app ? true : false;
          if(app_flag){
            delete req.body.app;
          }
          req.body.bundle = req.body.base_bundle.bundle_name;
          SubscriptionBundle.findOne({raw:true,where:{iptv:true,subscription_id:req.params.subscription_id}}).then(function(check_already_iptv){
            var exist_iptv_flag = (check_already_iptv != null) ? true : false;
          Subscription.update(req.body,{where:{subscription_id:req.params.subscription_id}}).then(function(data){
            SubscriptionBundle.update({addon_status:'cancel'},{where:{bundle_id:req.body.delarr,subscription_id:req.params.subscription_id}}).then(function (del) {
              SubscriptionBundle.update({addon_status:'true'},{where:{bundle_id:req.body.samearr,subscription_id:req.params.subscription_id}}).then(function (same) {
                SubscriptionBundle.update({addon_status:'true'},{where:{bundle_id:req.body.reupdatearr,subscription_id:req.params.subscription_id}}).then(function (reupdate) {
                  Org.findOne({raw:true,where:{org_id:req.orgId}}).then(function(org){
                    if(app_flag) {
                      req.body.app = true;
                    }
                    if((req.body.newarr.length > 0) || (req.body.app && !customer.app) || (req.body.base_bundle_updation)){
                      var date = new Date();
                      var firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
                      var credit_obj = {
                        org_id:req.orgId,
                        status:'Approved',
                        time_stamp: { [Op.between]: [firstDay, date]}
                      }
                      creditCalculation.Calculate(credit_obj ,cb)
                      function cb(data){
                        if(data.status == 200){
                          var account_balance=0;
                          account_balance = data.msg.object
                          var expires = new Date(req.body.expires_on)
                          var no_of_days=parseInt((new Date(expires)-date)/(1000*60*60*24))+1;
                          var amt_per_day;
                          var month = keyObj[req.body.mode]
                          var ott_flag = false;
                          var ott_amt = 0, ott_amt_with_gst = 0;
                          req.body.newarr.map(function (arg) {
                            delete arg.id;
                            arg.org_id = req.orgId;
                            if(!arg.iptv){
                              ott_flag = true;
                              if((arg.bundle_type == bundlepackage) && !req.body.base_bundle_updation && req.body.checkIptv && arg.iptv && !exist_iptv_flag
                              ) {
                              ott_amt =  ott_amt + arg[month];
                              }else if((arg.bundle_type == bundlepackage) && !req.body.base_bundle_updation && req.body.checkIptv && arg.iptv && exist_iptv_flag
                              ) {
                              amt_per_day = (arg[month]/dayObj[req.body.mode]);
                              ott_amt = ott_amt + (amt_per_day*no_of_days); 
                              }else if(arg.bundle_type == bundlepackage) {
                                // amt_per_day = (arg[month]/dayObj[req.body.mode]);
                                ott_amt = ott_amt + arg[month]; 
                              }
                              if(arg.bundle_type == externalpackage) {
                                ott_amt = ott_amt + arg[month];
                              }
                              if((arg.bundle_type == custompackage) && !req.body.base_bundle_updation && req.body.checkIptv && arg.iptv && !exist_iptv_flag) {
                              ott_amt = ott_amt + arg.bundle_cost;
                            }else if((arg.bundle_type == custompackage) && !req.body.base_bundle_updation && req.body.checkIptv && arg.iptv && exist_iptv_flag) {
                              amt_per_day = (arg.bundle_cost/dayObj[req.body.mode]);
                              ott_amt = ott_amt + (amt_per_day*no_of_days); 
                            }else if(arg.bundle_type == custompackage) {
                                ott_amt = ott_amt + arg.bundle_cost;
                              }
                            }

                            if((arg.bundle_type == bundlepackage) && !req.body.base_bundle_updation && req.body.checkIptv && arg.iptv && !exist_iptv_flag
                              ) {
                              add_on_without_gst = add_on_without_gst + arg[month]; 
                            }else if((arg.bundle_type == bundlepackage) && !req.body.base_bundle_updation && req.body.checkIptv && arg.iptv && exist_iptv_flag
                              ) {
                              amt_per_day = (arg[month]/dayObj[req.body.mode]);
                              add_on_without_gst = add_on_without_gst + (amt_per_day*no_of_days); 
                            }else if(arg.bundle_type == bundlepackage) {
                              // amt_per_day = (arg[month]/dayObj[req.body.mode]);
                              add_on_without_gst = add_on_without_gst + arg[month]; 
                            }
                            if(arg.bundle_type == externalpackage) {
                              add_on_without_gst = add_on_without_gst + arg[month];
                            }
                            if(arg.is_external_packages){
                              external_bundle_ids.push(arg.bundle_id)
                            }  
                            if((arg.bundle_type == custompackage) && !req.body.base_bundle_updation && req.body.checkIptv && arg.iptv && !exist_iptv_flag) {
                              add_on_without_gst = add_on_without_gst + arg.bundle_cost;
                            }else if((arg.bundle_type == custompackage) && !req.body.base_bundle_updation && req.body.checkIptv && arg.iptv && exist_iptv_flag) {
                              amt_per_day = (arg.bundle_cost/dayObj[req.body.mode]);
                              add_on_without_gst = add_on_without_gst + (amt_per_day*no_of_days); 
                            }else if(arg.bundle_type == custompackage) {
                              add_on_without_gst = add_on_without_gst + arg.bundle_cost;
                            }
                          })
                          ott_amt_with_gst = Number((ott_amt+((ott_amt*18)/100)).toFixed(2));
                          var add_on_with_gst = Number((add_on_without_gst+((add_on_without_gst*18)/100)).toFixed(2))
                          if(ott_flag && req.body.stb && req.body.app && customer.app){
                            add_on_with_gst = Number((add_on_with_gst + (ott_amt_with_gst-((ott_amt_with_gst*oper.discount)/100))).toFixed(2));
                          }
                          var exist_cost = 0, exist_cost_with_gst = 0,ip_arr=[];
                          if(req.body.stb && req.body.app && !customer.app){
                            add_on_with_gst = Number((add_on_with_gst + (ott_amt_with_gst-((ott_amt_with_gst*oper.discount)/100))).toFixed(2));
                            customer.subscription_bundles.map(function (data) {
                              if(!data.iptv){
                                ott_flag = true;
                                var filter = customer_bundle.filter(function (prop) {
                                  return (prop.bundle_id == data.bundle_id)
                                })
                                if(filter[0].bundle_type == bundlepackage) {
                                  // amt_per_day = (filter[0][month]/dayObj[req.body.mode]);
                                  exist_cost = exist_cost + filter[0][month]; 
                                }
                                if(filter[0].bundle_type == externalpackage) {
                                  exist_cost = exist_cost + filter[0][month];
                                }
                                if(filter[0].bundle_type == custompackage) {
                                  exist_cost = exist_cost + filter[0].bundle_cost;
                                }
                                if(!filter[0].iptv && ott_flag && req.body.stb && req.body.app) {
                                  var arr_obj = {
                                    bund_name : filter[0].bundle_name,
                                    mode      : req.body.mode,
                                    rate      : filter[0][month],
                                    quantity  : 1,
                                    status    : 'Payment',
                                    discount  :  oper.discount+ '% discount'
                                  }
                                  if(filter[0].bundle_type == externalpackage){
                                    arr_obj['amt'] =  filter[0][month] - (filter[0][month]*oper.discount/100);
                                  }
                                  if((filter[0].bundle_type == bundlepackage) && !req.body.base_bundle_updation && req.body.checkIptv && filter[0].iptv && !exist_iptv_flag
                                  ) {
                                     arr_obj['prorated_day'] = '- '+no_of_days+' days prorated';
                                     arr_obj['amt'] =  filter[0][month] - (filter[0][month]*oper.discount/100);
                                  }else if((filter[0].bundle_type == bundlepackage) && !req.body.base_bundle_updation && req.body.checkIptv && filter[0].iptv && exist_iptv_flag
                                  ) {
                                     arr_obj['prorated_day'] = '- '+no_of_days+' days prorated';
                                     var amtPerDay = (filter[0][month]/dayObj[req.body.mode]);
                                     var prorated_amt = (amtPerDay*no_of_days);
                                     arr_obj['amt'] =  prorated_amt - (prorated_amt*oper.discount/100); 
                                  }else if(filter[0].bundle_type == bundlepackage){
                                     arr_obj['amt'] =  filter[0][month] - (filter[0][month]*oper.discount/100);
                                  }
                                  if((filter[0].bundle_type == custompackage) && !req.body.base_bundle_updation && req.body.checkIptv && filter[0].iptv && !exist_iptv_flag) {
                                    arr_obj['amt'] =  filter[0].bundle_cost - (filter[0].bundle_cost*oper.discount/100);
                                  }else if((filter[0].bundle_type == custompackage) && !req.body.base_bundle_updation && req.body.checkIptv && filter[0].iptv && exist_iptv_flag) {
                                     arr_obj['prorated_day'] = '- '+no_of_days+' days prorated';
                                     var amtPerDay = (filter[0].bundle_cost/dayObj[req.body.mode]);
                                     var prorated_amt = (amtPerDay*no_of_days);
                                     arr_obj['amt'] =  prorated_amt - (prorated_amt*oper.discount/100);
                                  }else if(filter[0].bundle_type == custompackage){
                                    arr_obj['amt'] =  filter[0].bundle_cost - (filter[0].bundle_cost*oper.discount/100);
                                  }
                                  ip_arr.push(arr_obj);
                                }
                              }                            
                            })
                            if(ott_flag){
                              exist_cost_with_gst = Number((exist_cost+((exist_cost*18)/100)).toFixed(2));
                              add_on_with_gst = Number((add_on_with_gst + (exist_cost_with_gst-((exist_cost_with_gst*oper.discount)/100))).toFixed(2));
                            }
                          }
                          if(account_balance >= add_on_with_gst){
                            if(req.body.base_bundle_updation){
                              subscription_create_destroy();
                            }
                            // SubscriptionBundle.update({addon_status:'true'},{where:{bundle_id:req.body.reupdatearr,subscription_id:req.params.subscription_id}}).then(function (reupdate) {
                            Transaction.findOne({raw:true,where:{invoice_year:new Date().getFullYear()},order:[['trans_id','DESC']],limit:1}).then(function(trans){
                              var invoiceEntry = {
                                org_id:req.orgId,
                                org_name:org.org_name,
                                reseller_org_id:org.reseller_org_id,
                                type : 'Debit',
                                status:'Approved',
                                payment_method: 'Offline',
                                criteria        : 'Direct',
                                total_amount : add_on_with_gst,
                                invoices : []
                              }
                              if(trans){
                                if(trans.invoice_year == new Date().getFullYear()){
                                  invoiceEntry.invoice_acc_id = trans.invoice_acc_id + 1
                                  invoiceEntry.invoice_year = new Date().getFullYear()
                                  invoiceEntry.invoice_id = 'INV-'+invoiceEntry.invoice_year+'AC'+invoiceEntry.invoice_acc_id
                                }else{
                                  invoiceEntry.invoice_acc_id = 1
                                  invoiceEntry.invoice_year = new Date().getFullYear()
                                  invoiceEntry.invoice_id = 'INV-'+invoiceEntry.invoice_year+'AC'+invoiceEntry.invoice_acc_id
                                }
                              }else{
                                invoiceEntry.invoice_acc_id = 1
                                invoiceEntry.invoice_year = new Date().getFullYear()
                                invoiceEntry.invoice_id = 'INV-'+invoiceEntry.invoice_year+'AC'+invoiceEntry.invoice_acc_id
                              }

                              
                              var addon_name = '';
                              req.body.newarr.map(function(ip){
                                getBundleId.push(ip.bundle_id);
                                ip.addon_status = true;
                                ip.subscription_id = req.params.subscription_id;
                                addon_name = (addon_name=='')?ip.bundle_name:addon_name+', '+ip.bundle_name
                                if((ip.bundle_type == bundlepackage) && !req.body.base_bundle_updation && req.body.checkIptv && ip.iptv && !exist_iptv_flag) {
                                  invoiceEntry.invoices.push({
                                    bund_name : ip.bundle_name,
                                    mode      : req.body.mode,
                                    rate      : ip[month],
                                    quantity  : 1,
                                    status    : 'Payment',
                                    prorated_day : '- '+no_of_days+' days prorated',
                                    //amt       : ip[month]
                                    amt       : ip[month]
                                  })
                                }else if((ip.bundle_type == bundlepackage) && !req.body.base_bundle_updation && req.body.checkIptv && ip.iptv && exist_iptv_flag) {
                                  invoiceEntry.invoices.push({
                                    bund_name : ip.bundle_name,
                                    mode      : req.body.mode,
                                    rate      : ip[month],
                                    quantity  : 1,
                                    status    : 'Payment',
                                    prorated_day : '- '+no_of_days+' days prorated',
                                    //amt       : ip[month]
                                    amt       : Number(((ip[month]/dayObj[req.body.mode]) * no_of_days).toFixed(2))
                                  })
                                }else if(ip.bundle_type == bundlepackage){
                                  invoiceEntry.invoices.push({
                                    bund_name : ip.bundle_name,
                                    mode      : req.body.mode,
                                    rate      : ip[month],
                                    quantity  : 1,
                                    status    : 'Payment',
                                    //prorated_day : '- '+no_of_days+' days prorated',
                                    amt       : ip[month]
                                    //amt       : Number(((ip[month]/dayObj[req.body.mode]) * no_of_days).toFixed(2))
                                  })
                                }
                                if(ip.bundle_type == externalpackage) {
                                  invoiceEntry.invoices.push({
                                    bund_name : ip.bundle_name,
                                    mode      : req.body.mode,
                                    rate      : ip[month],
                                    quantity  : 1,
                                    status    : 'Payment',
                                    amt       : ip[month]
                                  })   
                                }
                                if((ip.bundle_type == custompackage) && !req.body.base_bundle_updation && req.body.checkIptv && ip.iptv && !exist_iptv_flag ) {
                                  invoiceEntry.invoices.push({
                                    bund_name : ip.bundle_name,
                                    mode      : req.body.mode,
                                    rate      : ip.bundle_cost,
                                    quantity  : 1,
                                    status    : 'Payment',
                                    prorated_day : '- '+30+' days prorated',
                                    amt       : ip.bundle_cost
                                  })   
                                }else if((ip.bundle_type == custompackage) && !req.body.base_bundle_updation && req.body.checkIptv && ip.iptv && exist_iptv_flag) {
                                  invoiceEntry.invoices.push({
                                    bund_name : ip.bundle_name,
                                    mode      : req.body.mode,
                                    rate      : ip.bundle_cost,
                                    quantity  : 1,
                                    status    : 'Payment',
                                    prorated_day : '- '+no_of_days+' days prorated',
                                    amt       : Number(((ip.bundle_cost/dayObj[req.body.mode]) * no_of_days).toFixed(2))
                                  })   
                                }else if(ip.bundle_type == custompackage){
                                  invoiceEntry.invoices.push({
                                    bund_name : ip.bundle_name,
                                    mode      : req.body.mode,
                                    rate      : ip.bundle_cost,
                                    quantity  : 1,
                                    status    : 'Payment',
                                    amt       : ip.bundle_cost
                                  })   
                                }
                                if(!ip.iptv && req.body.app && req.body.stb) {
                                  var arr_object = {
                                    bund_name : ip.bundle_name,
                                    mode      : req.body.mode,
                                    // rate      : ip[month],
                                    quantity  : 1,
                                    status    : 'Payment',
                                    // amt       : ip[month] - (ip[month]*oper.discount/100),
                                    discount  : oper.discount+ '% discount'
                                  }
                                  if(ip.bundle_type == bundlepackage) {
                                    arr_object['rate']  = ip[month];
                                    arr_object['amt'] =  ip[month] - (ip[month]*oper.discount/100);
                                    // arr_object['prorated_day'] = '- '+no_of_days+' days prorated';
                                    // var amtPerDay = (ip[month]/dayObj[req.body.mode]);
                                    // var prorated_amt = (amtPerDay*no_of_days);
                                    // arr_object['amt'] =  prorated_amt - (prorated_amt*oper.discount/100);
                                  }
                                  if(ip.bundle_type == externalpackage) {
                                    arr_object['rate']  = ip[month];
                                    arr_object['amt'] =  ip[month] - (ip[month]*oper.discount/100);
                                  }
                                  if(ip.bundle_type == custompackage) {
                                    arr_object['rate']  = ip.bundle_cost;
                                    arr_object['amt'] =  ip.bundle_cost - (ip.bundle_cost*oper.discount/100);
                                  }
                                  invoiceEntry.invoices.push(arr_object)
                                }
                              })
                              
                              
                              if(ip_arr.length>0){
                                 invoiceEntry.invoices = [...invoiceEntry.invoices,...ip_arr]
                              }
                              invoiceEntry.invoices.push({
                                bund_name : addon_name,
                                mode      : req.body.mode,
                                status    : 'Adjustment',
                                amt       : add_on_with_gst
                              })
                              invoiceEntry['bundle'] = addon_name; 
                              invoiceEntry['total_amount'] = add_on_with_gst;
                              invoiceEntry['paid_amount'] = 0;
                              if(req.body.base_bundle_updation){
                                getBundleId.push(req.body.base_bundle.bundle_id)
                              }
                              if(invoiceObj){
                                invoiceEntry.invoices.push(invoiceObj)
                              }
                              invoiceEntry.invoices = [...invoiceEntry.invoices, ...reupdate_invoice_arr]
                              
                              var sub_update_obj = {
                                app:app_flag,
                                expires_on:expiryDate
                              }
                              if(req.body.update_and_renew){
                                sub_update_obj['status'] = 'Active'
                              }
                              if(req.body.checkIptv){
                                sub_update_obj.expires_on = iptv_expiry_date
                              }
                              Transaction.create(invoiceEntry,{include:[Invoice]}).then(function(trans){
                                Subscription.update(sub_update_obj,{where:{subscription_id:req.params.subscription_id}}).then(function(app_update){
                                  SubscriptionBundle.bulkCreate(req.body.newarr).then(function (create_new) {
                                    SubscriptionPackage.findAll({raw:true,where:{subscription_id:req.params.subscription_id}}).then(function (exist_package) {
                                      BundlePackage.findAll({where:{bundle_id:getBundleId},include:[Bundle],attributes:{exclude:['id','createdAt','updatedAt']}}).then(function (bundlepacks) {
                                        var old_packages=getPackages(exist_package);
                                        var subpack_new_arr = [], subpack_update_arr = [];
                                        for (var i = bundlepacks.length - 1; i >= 0; i--) {
                                          var new_package=bundlepacks[i];
                                          var pack_id=new_package.package_id;
                                          new_package.createdAt = new Date();
                                          new_package.subscription_id = req.params.subscription_id;
                                          if(old_packages[pack_id]){
                                            if(new_package.bundle.iptv){
                                              new_package.expiry_date = iptv_expiry_date;
                                            }else{
                                              new_package.expiry_date = expiryDate;
                                            }
                                            subpack_update_arr.push({
                                              package_id: new_package.package_id,
                                              provider_id: new_package.provider_id,
                                              bundle_id: new_package.bundle_id,
                                              expiry_date: new_package.expiry_date,
                                              subscription_id: new_package.subscription_id,
                                            })
                                          }else{
                                            if(!subpack_new_arr.some(function(item){ return (item.package_id===pack_id)})){
                                              if(new_package.bundle.iptv){
                                                new_package.expiry_date = iptv_expiry_date;
                                              }else{
                                                new_package.expiry_date = expiryDate;
                                              }
                                              subpack_new_arr.push({
                                                package_id: new_package.package_id,
                                                provider_id: new_package.provider_id,
                                                bundle_id: new_package.bundle_id,
                                                expiry_date: new_package.expiry_date,
                                                subscription_id: new_package.subscription_id,
                                              })
                                            }
                                          }
         if(i == bundlepacks.length-1 ){
                                      SubscriptionPackage.bulkCreate(subpack_new_arr).then(function(create_sub_pack) {
                                        for (var i = subpack_update_arr.length - 1; i >= 0; i--) {
                                          var pack_data = subpack_update_arr[i];
                                          SubscriptionPackage.update(pack_data,{where:{package_id:pack_data.package_id,subscription_id:pack_data.subscription_id}}).then(function(update_sub_pack){
                                          })
                                        }
                                      })
                                      sendInvoice(trans.transaction_id, 'Invoice.pdf', callbk)
                                      function callbk(msg){
                                        if(external_bundle_ids.length > 0){
                                          Subscription.findOne({raw:true,where:{subscription_id:req.params.subscription_id}}).then(function(data_sub){
                                            external_apps_call('single',data_sub,external_bundle_ids,data_sub.expires_on,function (argument) {
                                              sms_call();
                                            })
                                          })
                                        }else{
                                          sms_call();
                                        }
                                        function sms_call (){
                                          var sms_ids = [];
                                          var org_address = org.city+', '+org.state+', '+org.pincode
                                          if(req.body.checkIptv){
                                            Subscription.findOne({raw:true,where:{subscription_id:req.params.subscription_id}}).then(function(customer){
                                              var m2m_payload = {
                                                customer_id : req.params.subscription_id,
                                                customer_firstname:req.body.name,
                                                email:req.body.email,
                                                phone_number:req.body.phone_number,
                                                username:req.body.name,
                                                activation_code : JSON.stringify(generateActivationCode(req.body.email,org.short_code)),
                                                user_id : req.userId,
                                                org_id : org.org_id,
                                                billing_address : org_address,
                                                billing_city : org.city,
                                                billing_pincode : org.pincode,
                                                installation_address : org_address,
                                                installation_city : org.city,
                                                installation_pincode : org.pincode,
                                                installation_state : org.state,
                                                billing_state : org.state,
                                                unique_id :req.body.serial_no,
                                                account_lock : 'Disable',
                                                start_date : customer.activated_on,
                                                end_date : customer.expires_on,
                                                user_id : req.userId,
                                                is_auto_renew: customer.autorenewal,
                                                mac_address: req.body.mac_address,
                                                base_bundle_updation: req.body.base_bundle_updation
                                              };
                                              if(req.body.newarr.length > 0){
                                                req.body.newarr.map(function(pos){
                                                  if(!pos.bundle_name.includes('NCF')){
                                                    if(pos.iptv){
                                                      sms_ids.push(pos.bundle_id)
                                                    }
                                                  }
                                                })
                                              }
                                                BundlePackage.findAll({raw:true,where:{bundle_id:sms_ids},attributes:{exclude:['id','createdAt','updatedAt']}}).then(function(bun){
                                                  var pro_id =bun[0].provider_id
                                                  Provider.findOne({raw:true,where:{provider_id:pro_id}}).then(function(provider){
                                                    bun.map(function(input){
                                                      input.customer_id = req.params.customer_id;
                                                      input.status = 'COMPLETED';
                                                      input.start_date   = new Date().setHours(0,0,0,0);
                                                      var iptv_package_name = input.package_name.split('-');
                                                      input.package_name=iptv_package_name[1];
                                                    })
                                                    m2m_payload['package'] = bun;
                                                    m2m_payload['customer_id'] = req.params.subscription_id;
                                                    var obj=HTTPCli.M2MReq(provider.sms_host,provider.sms_port,'POST',m2m_payload,'/api/partner/edit',provider.sms_token);
                                                    HTTPCli.https_to_SMS(obj,sucess_cb,error_cb);
                                                    function error_cb(err){
                                                      m2m_payload['sms_host'] = provider.sms_host
                                                      m2m_payload['sms_port'] = provider.sms_port
                                                      m2m_payload['sms_token'] = provider.sms_token
                                                      m2m_payload['api'] = '/api/partner/edit'
                                                      var retry_key = 'payload'+random_number(options);
                                                      m2m_payload['retry_key'] = retry_key
                                                      sms_retry.set(retry_key, m2m_payload);
                                                      sms_retry.save();
                                                    }
                                                    function sucess_cb(data){
                                                      D && console.log("sucess",data);
                                                    }
                                                  })
                                                })
                                              })
                                            }
                                          }
                                          res.status(200).send(msg);
                                        }
          }
          }
          })
                                      })
                                    })
                                  })
                                })
                              })
                            
                          //})
                          }else {
                            req.body.newarr.map(function(ip){
                              ip.subscription_id = req.params.subscription_id;
                            })
                            var finalAmt = add_on_with_gst - account_balance
                            if(account_balance > 0){
                              var msg ="Rs "+account_balance+" been adjusted with the credit"
                            }else{
                              var msg ="No Credit available please make the payment to proceed!"
                            }
                            res.status(200).send({
                              msg: msg,
                              btn: "Make Rs."+finalAmt+" payment to complete",
                              account_balance: account_balance,
                              adjusted_amount: finalAmt,
                              newarr: req.body.newarr,
                              samearr: samearr_on_edit,
                              reupdatearr: reupdatearr_on_edit,
                              no_of_days: no_of_days,
                              app:app_flag,
                              base_bundle_updation: req.body.base_bundle_updation,
                              updated_base_bundle: req.body.base_bundle,
                              exist_base_bundleid: req.body.exist_base_bundleid
                            });
                          }
                        }
                      }
                    }else{
                      if(data == 0) {res.status(500).send("Subscription updation failed")}
                      if(data > 0){
                        res.status(200).send("Subscription updated successfully")
                      }
                    }
                  })
                })
              })
            })
          },function(err){
            if(err && err.errors[0].message) { return res.status(500).send(err.errors[0].message)} //DUPLICATE ENTRY FOR UNIQUE FIELD
            res.status(500).send("Problem in Subscription updation failed")
          });
          })
          })
        })
      })
    // })
  },function(err){
    res.status(500).send("Problem in finding Subscription")
  });
});

router.put("/",VerifyToken,function(req,res){
  var external_bundle_ids=[], selected_bundles=[];
  var query = req.body;
  BillSetting.findOne({raw: true}).then((billsetting) => {
    if (billsetting) {
      const payment_details = {
        payment_fields: billsetting.payment_fields,
        api_get_payment_link: billsetting.api_get_payment_link,
        api_payment_link_status: billsetting.api_payment_link_status
      }
      var payment_id='';var saleArr = []
      if(query.razorpay_invoice_id){
        payment_id=query.razorpay_invoice_id;
      }else{
        payment_id=query.razorpay_payment_id
        query.razorpay_invoice_id = query.razorpay_payment_link_id;
      }

      Razorpay.isPaymentSuccess(payment_id, payment_details, (data) => {
        if (data && !isEmpty(data) && data.status=='paid') {
          if(query.is_manual_renewal){
            BundlePackage.findAll({raw:true}).then(function(bundlepack){
              totalBundlePack = bundlepack;
              User.findOne({raw:true,where:{org_id:req.orgId}}).then(function(users){
                var renewalDb = [];
                SubscriptionPackage.findAll({raw:true}).then(function (subscription_package) {
                  totalSubscriptionPack = subscription_package;
                  Subscription.findAll({where:{retainer_invoice_id:query.razorpay_invoice_id},include:[{model:SubscriptionBundle,where:{retainer_invoice_id:query.razorpay_invoice_id},attributes:{exclude:['id']},where:{base:true}}]}).then(function(sub){
                    sub.map(function(point,count){
                      var sub_bundle = point.subscription_bundles[0];
                      var point=point.get({plain:true})
                      var expiry = new Date();
                      point.status = 'Active';
                      var days = (renewalObj[point.mode]);
                      var active_date = new Date().setHours(0,0,0,0);
                      point.activated_on = active_date;
                      var expiry = new Date(expiry.setDate(expiry.getDate() + days)).setHours(23,59,59,999);
                      point.expires_on =  expiry;
                      var packfilter = totalSubscriptionPack.filter(function (prop) {
                        return ((prop.bundle_id == sub_bundle.bundle_id) && ((prop.subscription_id == sub_bundle.subscription_id)))
                      })
                      packfilter.map(function(prop){
                        prop.expiry_date = expiry;
                      })
                      var salepackages = [];
                      (point.subscription_bundles).map(function(proc){
                        if(proc && !proc.bundle_name.includes('NCF') && proc.iptv){
                          var packages = totalBundlePack.filter(function (entry) {
                            delete entry.id;
                            delete entry.createdAt
                            delete entry.updatedAt
                            entry.status = 'COMPLETED';
                                    entry.start_date   = point.activated_on;
                            return (entry.bundle_id == proc.bundle_id);
                          })
                          salepackages = [...salepackages,...packages]
                        } 
                      })
                      if(point.checkIptv){
                        saleArr.push({
                          customer_id     : point.subscription_id,
                          activation_code   : point.serial_no.split("-")[0],
                          customer_email    : point.email,
                          customer_firstname  : point.name,
                          start_date      : point.activated_on,
                          end_date      : point.expires_on,
                          is_active       : 0,
                          status        : 'SKIE_RENEWAL',
                          user_id       : req.userId,
                          customer_id     : point.subscription_id,
                          is_auto_renew     : point.autorenewal,
                          unique_id       : point.serial_no,
                          salespackages     : salepackages
                        })
                      }
                      point.subscription_package = packfilter
                      Subscription.update(point,{where:{retainer_invoice_id:query.razorpay_invoice_id,subscription_id:point.subscription_id}}).then(function(update_renewal){
                        sub_pack_update(point);
                        if(count+1 == sub.length){
                          default_updation();
                          sms_renewal_call();
                          
                        }
                      })
                    })
                  })
                })
              })
            })
            function sub_pack_update(renewalSubPack) {
              if(renewalSubPack.subscription_package.length > 0){
                for (var i = 0; i < renewalSubPack.subscription_package.length; i++) {
                  var packData = renewalSubPack.subscription_package[i];
                  SubscriptionPackage.update(packData,{where:{subscription_id:renewalSubPack.subscription_id, package_id:packData.package_id }}).then(function (subscription_pack) {
                  })
                }
              }
            }
          }else if(query.adjust_update){
           if(query.app == 'true/'){
            Subscription.update({app:true},{where:{retainer_invoice_id:query.razorpay_invoice_id}}).then(function(app_update){
            })
           }
           if(req.body.update_and_renew){
            Subscription.findOne({raw:true,where:{retainer_invoice_id:query.razorpay_invoice_id}}).then(function(get_sub){
              var days = (renewalObj[get_sub.mode]);
              var expiry = new Date(); 
              var expiryDate = new Date(expiry.setDate(expiry.getDate() + days)).setHours(23,59,59,999);
              var input_obj = {
                retainer_invoice_id:query.razorpay_invoice_id,
                [Op.or]: [
                    {
                      addon:  true
                    }, 
                    {
                      base: true
                    }
                  ]
              }
              SubscriptionBundle.findAll({raw:true,where:input_obj}).then(function (get_bundle_list) {
                var get_bundle_id_list = get_bundle_list.map(function (data) {
                  return data.bundle_id
                })
                SubscriptionPackage.update({expiry_date:expiryDate},{where:{bundle_id:get_bundle_id_list,subscription_id:get_bundle_list[0].subscription_id}}).then(function (update_date) {
                  Subscription.update({expires_on:expiryDate},{where:{subscription_id:get_bundle_list[0].subscription_id}}).then(function(sub_updation){
                  })
                })
              })
            })
           }
           SubscriptionBundle.findAll({where:{retainer_invoice_id:query.razorpay_invoice_id},include:[Bundle]}).then(function (find_sub_bundle) {
              find_sub_bundle.map(function (iter, i) {
                var iteration = iter.get({plain:true})
                if(iteration.bundle.is_external_packages){
                  external_bundle_ids.push(iteration.bundle['bundle_id']);
                }
                if(i+1 == find_sub_bundle.length){
                  sms_edit_call()
                  default_updation()
                }
              })
            })
           // sms_edit_call()
           // default_updation()
          }
          else if((query.checkIptv == 'true/') || (query.checkIptv == 'true')){
            SubscriptionBundle.findAll({where:{retainer_invoice_id:query.razorpay_invoice_id},include:[Bundle]}).then(function (find_sub_bundle) {
              find_sub_bundle.map(function (iter, i) {
                var iteration = iter.get({plain:true})
                if(iteration.bundle.is_external_packages){
                  external_bundle_ids.push(iteration.bundle['bundle_id']);
                }
                if(i+1 == find_sub_bundle.length){
                  sms_call()
                  default_updation()
                }
              })
            })
          }
          else if((query.checkIptv == 'false/') || (query.checkIptv == 'false')){
            SubscriptionBundle.findAll({where:{retainer_invoice_id:query.razorpay_invoice_id},include:[Bundle]}).then(function (find_sub_bundle) {
              find_sub_bundle.map(function (iter, i) {
                var iteration = iter.get({plain:true})
                if(iteration.bundle.is_external_packages){
                  external_bundle_ids.push(iteration.bundle['bundle_id']);
                }
                if(i+1 == find_sub_bundle.length){
                  default_updation()
                }
              })
            })
          }
          function sms_renewal_call(){
            Provider.findAll({raw:true}).then(function(providers){
              if(saleArr.length > 0 && saleArr[0].salespackages.length >0){
                var provider_data = providers.filter(function (entry) {
                  return (entry.provider_id == saleArr[0].salespackages[0].provider_id);
                })
                var provider = provider_data[0];
                var sms_payload = {
                  saleArr: saleArr
                }
                var obj=HTTPCli.M2MReq(provider.sms_host,provider.sms_port,'POST',sms_payload,'/api/partner/renewal',provider.sms_token);
                HTTPCli.https_to_SMS(obj,sucess_cb,error_cb);
                function error_cb(err){
                  sms_payload['sms_host'] = provider.sms_host;
                  sms_payload['sms_port'] = provider.sms_port;
                  sms_payload['sms_token'] = provider.sms_token;
                  sms_payload['api'] = '/api/partner/renewal';
                  var retry_key = 'payload'+random_number(options);
                  sms_payload['retry_key'] = retry_key;
                  sms_retry.set(retry_key, sms_payload);
                  sms_retry.save();
                }
                function sucess_cb(data){
                  D && console.log("sucess",data);
                }
              }
            })
          }
          function default_updation(){
            Transaction.update({status:'Approved'},{where:{retainer_invoice_id:query.razorpay_invoice_id}}).then(function(status){
              Subscription.update({status:'Active'},{where:{retainer_invoice_id:query.razorpay_invoice_id,is_new:false}}).then(function(update_status){
                Subscription.update({status:'New'},{where:{retainer_invoice_id:query.razorpay_invoice_id,is_new:true}}).then(function(update_status){
                  SubscriptionBundle.update({addon_status:true},{where:{retainer_invoice_id:query.razorpay_invoice_id}}).then(function(addon_update){
                    Transaction.findOne({raw:true,where:{retainer_invoice_id:query.razorpay_invoice_id,type:['Debit'],criteria:'ManualRenewal'}}).then(function(trans){
                      if(trans){
                        execute(trans.transaction_id)
                      }else{
                        Transaction.findOne({raw:true,where:{retainer_invoice_id:query.razorpay_invoice_id,type:['Debit'],criteria:'Direct'}}).then(function(tran){
                          execute(tran.transaction_id)
                        })
                      }
                    },function(err){
                      res.status(500).send("There was a problem in adding the Subscription")
                    })

                    function execute(id){
                      Transaction.findAll({where:{transaction_id:id},include:[Invoice]}).then(function(invoice){
                        Org.findOne({raw:true,where:{org_id:invoice[0].org_id}}).then(function(org){
                          var file_name = 'Invoice.pdf';
                          var arr = [];
                          transactionPDF.create(file_name,arr,org,invoice[0],function(path){
                            var subject = 'Invoice from Skie'
                            var attach = [{filename:file_name,path:path.filename}]
                            Mailer.sendMail(null,null,org.report_email,false,null,attach,subject,callbk);
                            function callbk(data){
                              if(external_bundle_ids.length > 0){
                                if(query.creation == 'bulkCreate/'){
                                  Subscription.findAll({raw:true,where:{retainer_invoice_id:query.razorpay_invoice_id}}).then(function(data_sub){
                                    var data_obj = {arr : data_sub,mode:data_sub[0].mode}
                                    external_apps_call('multiple',data_obj,external_bundle_ids,data_sub[0].expires_on,function (argument) {
                                      res.status(200).send("Subscription added successfully")
                                    })
                                  })
                                }else{
                                  Subscription.findOne({raw:true,where:{retainer_invoice_id:query.razorpay_invoice_id}}).then(function(data_sub){
                                    external_apps_call('single',data_sub,external_bundle_ids,data_sub.expires_on,function (argument) {
                                      res.status(200).send("Subscription added successfully")
                                    })
                                  })
                                }
                              }else{
                                res.status(200).send("Subscription added successfully")
                              }
                            }
                          });  
                        },function(err){
                          res.status(500).send("There was a problem in adding the Subscription")
                        })
                      })
                    }
                  })
                })
              })
            })
          }
          function sms_call (){
            var m2mArr = []
            Subscription.findAll({where:{retainer_invoice_id:query.razorpay_invoice_id},include:[SubscriptionBundle]}).then(function(sub){
              Org.findOne({raw:true,where:{org_id:sub[0].org_id}}).then(function(org){
                var org_address = org.city+', '+org.state+', '+org.pincode
                if(sub[0].checkIptv){
                  var m2m_payload;
                  var sms_ids = [];
                  sub.map(function(factor){
        EMM.update({status:'Active'},{where:{unique_id:factor.serial_no}}).then(function(updated_emm){
      });
                    factor.subscription_bundles.map(function(pos){
                      if(pos.iptv){
                        sms_ids.push(pos.bundle_id)
                      }
                    })
                    m2mArr.push({
                      activation_code : JSON.stringify(generateActivationCode(factor.email,org.short_code)),
                      user_id : req.userId,
                      org_id : org.org_id,
                      customer_firstname : factor.name,
                      billing_address : org_address,
                      billing_city : org.city,
                      billing_pincode : org.pincode,
                      installation_address : org_address,
                      installation_city : org.city,
                      installation_pincode : org.pincode,
                      installation_state : org.state,
                      billing_state : org.state,
                      unique_id : factor.serial_no,
                      serial_no : factor.serial_no,
                      username : factor.name,
                      email : factor.email,
                      phone_number : factor.mobile,
                      start_date : factor.activated_on,
                      end_date : factor.expires_on,
                      subscription_id: factor.subscription_id,
                      customer_id: factor.subscription_id,
                      customer_firstname : factor.name,
                      is_auto_renew:  factor.autorenewal,
                      account_lock : 'Disable',
                      name  : factor.name,
          mac_address: factor.mac_address
                    })
                  })

                  m2m_payload = {
                    customer : m2mArr
                  }
                  BundlePackage.findAll({raw:true,where:{bundle_id:sms_ids},attributes:{exclude:['id','createdAt','updatedAt']},}).then(function(bun){
                    var pro_id =bun[0].provider_id
                    Provider.findOne({raw:true,where:{provider_id:pro_id}}).then(function(provider){
                      bun.map(function(input){
                        input.status = 'COMPLETED';
                        input.start_date   = m2m_payload.customer[0].start_date
                        var iptv_package_name = input.package_name.split('-');
                        input.package_name=iptv_package_name[1];
                      })
                      m2m_payload['package'] = bun
                      m2m_payload['user_id'] = req.userId
                      var obj=HTTPCli.M2MReq(provider.sms_host,provider.sms_port,'POST',m2m_payload,'/api/partner/subscription',provider.sms_token);

                      HTTPCli.https_to_SMS(obj,sucess_cb,error_cb);
                      function error_cb(err){
                        m2m_payload['sms_host'] = provider.sms_host;
                        m2m_payload['sms_port'] = provider.sms_port;
                        m2m_payload['sms_token'] = provider.sms_token;
                        m2m_payload['api'] = '/api/partner/subscription';
                        var retry_key = 'payload'+random_number(options);
                        m2m_payload['retry_key'] = retry_key;
                        sms_retry.set(retry_key, m2m_payload);
                        sms_retry.save();
                      }
                      function sucess_cb(data){
                        D && console.log("sucess",data);
                      }
                    })
                  })
                }
              })
            })
          }
          function sms_edit_call(){
            var sms_ids = [];
            Subscription.findOne({where:{retainer_invoice_id:query.razorpay_invoice_id},include:[SubscriptionBundle]}).then(function(customer){
              Org.findOne({raw:true,where:{org_id:customer.org_id}}).then(function(org){
                var org_address = org.city+', '+org.state+', '+org.pincode;
                var m2m_payload = {
                  customer_id : customer.subscription_id,
                  customer_firstname:customer.name,
                  email:customer.email,
                  phone_number:customer.phone_number,
                  username:customer.name,
                  activation_code : JSON.stringify(generateActivationCode(customer.email,org.short_code)),
                  user_id : req.userId,
                  org_id : org.org_id,
                  billing_address : org_address,
                  billing_city : org.city,
                  billing_pincode : org.pincode,
                  installation_address : org_address,
                  installation_city : org.city,
                  installation_pincode : org.pincode,
                  installation_state : org.state,
                  billing_state : org.state,
                  unique_id :customer.serial_no,
                  account_lock : 'Disable',
                  start_date : customer.activated_on,
                  end_date : customer.expires_on,
                  user_id : req.userId,
                  is_auto_renew: customer.autorenewal
                };
                customer.subscription_bundles.map(function(pos){
                  if(pos.iptv){
                    sms_ids.push(pos.bundle_id)
                  }
                })
                if(sms_ids.length > 0){
                  BundlePackage.findAll({raw:true,where:{bundle_id:sms_ids},attributes:{exclude:['id','createdAt','updatedAt']}}).then(function(bun){
                    var pro_id =bun[0].provider_id
                    Provider.findOne({raw:true,where:{provider_id:pro_id}}).then(function(provider){
                      bun.map(function(input){
                        input.customer_id = customer.subscription_id;
                        input.status = 'COMPLETED';
                        input.start_date   = new Date()
                        var iptv_package_name = input.package_name.split('-');
                        input.package_name=iptv_package_name[1];
                      })
                      m2m_payload['package'] = bun;
                      m2m_payload['customer_id'] = customer.subscription_id;
                      var obj=HTTPCli.M2MReq(provider.sms_host,provider.sms_port,'POST',m2m_payload,'/api/partner/edit',provider.sms_token);
                      HTTPCli.https_to_SMS(obj,sucess_cb,error_cb);
                      function error_cb(err){
                        m2m_payload['sms_host'] = provider.sms_host;
                        m2m_payload['sms_port'] = provider.sms_port;
                        m2m_payload['sms_token'] = provider.sms_token;
                        m2m_payload['api'] = '/api/partner/edit';
                        var retry_key = 'payload'+random_number(options);
                        m2m_payload['retry_key'] = retry_key;
                        sms_retry.set(retry_key, m2m_payload);
                        sms_retry.save();
                      }
                      function sucess_cb(data){
                        D && console.log("sucess",data);
                      }
                    })
                  })
                }
              })
            })
          }
        }
      })
    }
  })
})

router.delete("/:subscription_id/:flag",VerifyToken,function(req,res){
  Subscription.findOne({where:{subscription_id:req.params.subscription_id},include:[SubscriptionBundle]}).then(function (sub) {
    AccessLogin.findOne({raw:true,where:{subscription_id:req.params.subscription_id}}).then(function(login){
      if(login && (req.params.flag == 'delete')){
        logoutAndDelete.execute(req.params.subscription_id,login.device_type,login.device_id,cb)
        function cb(data){
          if(data){
              Subscription.destroy({where:{subscription_id:req.params.subscription_id}}).then(function(subscription){
                EMM.update({status:'Deactive'},{where:{unique_id:sub.serial_no}}).then(function(updated_emm){
                sms_delete_call(sub);
                res.status(200).send("Subscription Deleted Successfully")
                })
              })
            }
          }
      }else if(!login && (req.params.flag == 'delete')){
        Subscription.destroy({where:{subscription_id:req.params.subscription_id}}).then(function(subscription){
          EMM.update({status:'Deactive'},{where:{unique_id:sub.serial_no}}).then(function(updated_emm){
          sms_delete_call(sub);
          res.status(200).send("Subscription Deleted Successfully")
          }) 
        })
      }else if(req.params.flag == 'logout'){
        logoutAndDelete.execute(req.params.subscription_id,login.device_type,login.device_id,cb)
        function cb(data){
          if(data){
            res.status(200).send("Subscription Logout Successfully")
          }
        }
      }
    })
  })
  function sms_delete_call (sub){
    var sms_ids = [];
    if(sub.checkIptv){
      var m2m_payload ={}
      sub.subscription_bundles.map(function(pos){
        if(pos.iptv){
          sms_ids.push(pos.bundle_id)
        }
      })
      BundlePackage.findAll({raw:true,where:{bundle_id:sms_ids},attributes:{exclude:['id','createdAt','updatedAt']},}).then(function(bun){
        var pro_id =bun[0].provider_id
        Provider.findOne({raw:true,where:{provider_id:pro_id}}).then(function(provider) {
          m2m_payload['subscription_id'] = sub.subscription_id;
          var obj=HTTPCli.M2MReq(provider.sms_host,provider.sms_port,'POST',m2m_payload,'/api/partner/subscriber_delete',provider.sms_token);
          HTTPCli.https_to_SMS(obj,sucess_cb,error_cb);
          function error_cb(err){
            m2m_payload['sms_host'] = provider.sms_host;
            m2m_payload['sms_port'] = provider.sms_port;
            m2m_payload['sms_token'] = provider.sms_token;
            m2m_payload['api'] = '/api/partner/subscriber_delete';
            var retry_key = 'payload'+random_number(options);
            m2m_payload['retry_key'] = retry_key;
            sms_retry.set(retry_key, m2m_payload);
            sms_retry.save();
          }
          function sucess_cb(data){
            D && console.log("sucess",data);
          }
        })
      })
    }
  }
})

router.get("/oper/filter/:org_id/:limit/:offset",VerifyToken,function(req,res){
  var obj = {org_id:req.params.org_id}
  var limit = req.params.limit;
  var off = (req.params.offset == 0) ? 0 : (req.params.offset -1) * limit
  Subscription.findAndCountAll({where:obj,limit:Number(limit),offset:Number(off),include:[{model:AccessLogin},{model:SubscriptionBundle},{model:Org,as:'subscriberOrg'}],order:[['createdAt','DESC']]}).then(function(all_type_info) {
    if(all_type_info.rows.length > 0) {
      getTotalPages(all_type_info,limit,function (obj) {
        res.status(200).send(obj);   
      });
    }else{
      res.status(200).send({ count: 0, rows: [] });
    }
  },
  function(err){
    res.status(500).send("Problem in finding Subscription");
  })
})


router.post("/restore", function(req, res) {
    Subscription.findAll({
        where: req.body,
        include: [{
            model: SubscriptionBundle,
            include: [{
                model: Bundle,
                include: [BundlePackage]
            }]
        }, {
            model: SubscriptionPackage
        }]
    }).then(function(subscriptions) {
  var map={}
        var new_subscription_packages = [];
        for (var i = subscriptions.length - 1; i >= 0; i--) {
            var subscription = subscriptions[i];
      map[subscription.org_id]=true;
            var subscription_bundles = subscription.subscription_bundles;
            var subscription_packages = subscription.subscription_packages;
            if (subscription_packages && subscription_packages.length > 0) {
                for (var k = subscription_bundles.length - 1; k >= 0; k--) {
                    var subscription_bundle = subscription_bundles[k];
                    if (!subscription_bundle.bundle) continue;       
                    var bundle_packages = subscription_bundle.bundle.bundlepackages;
                    for (var l = bundle_packages.length - 1; l >= 0; l--) {
                        var bundle_package = bundle_packages[l];
                        if (!subscription_packages.some(function(subscription_package) {
                                return subscription_package.package_id == bundle_package.package_id
                            })) {
                            var subscription_pack_obj = {
                                subscription_id: subscription.subscription_id,
                                package_id: bundle_package.package_id,
                                bundle_id: bundle_package.bundle_id,
                                provider_id: bundle_package.provider_id,
                                expiry_date: subscription.expires_on
                            }
                            new_subscription_packages.push(subscription_pack_obj);
                        }
                    }
                }
            } else {
                for (var k = subscription_bundles.length - 1; k >= 0; k--) {
                    var subscription_bundle = subscription_bundles[k];
                    if (!subscription_bundle.bundle) continue;
                    var bundle_packages = subscription_bundle.bundle.bundlepackages;
                    for (var l = bundle_packages.length - 1; l >= 0; l--) {
                        var bundle_package = bundle_packages[l];
                        var subscription_pack_obj = {
                            subscription_id: subscription.subscription_id,
                            package_id: bundle_package.package_id,
                            bundle_id: bundle_package.bundle_id,
                            provider_id: bundle_package.provider_id,
                            expiry_date: subscription.expires_on
                        }
                        new_subscription_packages.push(subscription_pack_obj);
                    }
                }
            }
        }
        SubscriptionPackage.bulkCreate(new_subscription_packages).then(function(create) {
            res.status(200).send({
                packages_length: new_subscription_packages.length,
    org_ids:map,
    packages:new_subscription_packages,
                subscribers: subscriptions.length
            })
        })
    })
});

module.exports = router;
