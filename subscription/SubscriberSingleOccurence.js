var editJsonFile = require('edit-json-file'),
  conf = editJsonFile(__root + 'config.json'),
  Razorpay = require(__root + __core + 'modules/razorpayOld'),
  VerifyToken = require(__root + __core + 'modules/VerifyToken'),
  creditCalculation = require(__root + __core + 'modules/creditCalculation'),
  logoutAndDelete = require(__root + __core + 'modules/logoutAndDelete'),
  transactionPDF = require(__root + __core + 'modules/TransactionPDFTemplate.js'),
  Mailer = require(__root + __core + 'modules/Mailer'),
  HTTPCli = require(__root + __core + 'modules/HTTPClient'),
  sms_retry = editJsonFile(__root + __core + 'modules/smsRetry.json'),
  crypto = require('crypto'),
  sequelize = __db_model.sequelize,
  random_number = require('random-number'),
  options = { min: 1, max: 10000, integer: true },
  D = conf.get("D"),
  bundlepackage = "bundlepackage",
  externalpackage = "externalpackage",
  custompackage = "custompackage",
  resellerpackage = "resellerpackage";


var Subscription = __db_model.Subscription,
  Transaction = __db_model.Transaction,
  Org = __db_model.Org,
  Bundle = __db_model.Bundle,
  AccessLogin = __db_model.AccessLogin,
  Invoice = __db_model.Invoice,
  SubscriptionBundle = __db_model.SubscriptionBundle,
  OperatorSetting = __db_model.OperatorSetting,
  BundlePackage = __db_model.BundlePackage,
  Provider = __db_model.Provider,
  EMM = __db_model.EMM,
  BillSetting = __db_model.BillSetting,
  SubscriptionPackage = __db_model.SubscriptionPackage,
  ExternalApp = __db_model.ExternalApp,
  Coupon = __db_model.Coupon,
  BundleExternalPackage = __db_model.BundleExternalPackage,
  BundleCustomExternalPackage = __db_model.BundleCustomExternalPackage,
  SubscriberExternalApp = __db_model.SubscriberExternalApp,
  BundleResellerCustomPackage = __db_model.BundleResellerCustomPackage,
  BundleGroupedPackage = __db_model.BundleGroupedPackage;
var SubscriberBulk = {};
var keyObj = {
  'One Month': 'price_one_month',
  'Three Month': 'price_three_month',
  'Six Month': 'price_six_month',
  'Twelve Month': 'price_twelve_month'
};
var dayObj = {
  'One Month': 30,
  'Three Month': 90,
  'Six Month': 180,
  'Twelve Month': 360
};
var renewalObj = {
  'One Month': 29,
  'Three Month': 89,
  'Six Month': 179,
  'Twelve Month': 359
};
var code_obj = {
  "One Month": "monthly_code",
  "Three Month": "quarterly_code",
  "Six Month": "halfyearly_code",
  "Twelve Month": "yearly_code"
};

function generateActivationCode(customer_mail, mso_short_name) {
  var data = crypto.createHmac('sha256', customer_mail + mso_short_name + new Date())
    .update('1vtabMRSS')
    .digest('hex')
  var hash = 0, i, chr;
  if (data.length === 0) return hash;
  for (i = 0; i < data.length; i++) {
    chr = data.charCodeAt(i);
    hash = Math.abs(((hash << 5) - hash) + chr) + 10000000;
    hash |= 0;
  }
  var code = Math.abs(hash % 100000000);
  if (code.toString().length < 8) code = code + 10000000;
  return code;
}

function bundle_invoice(request, subscription_bund, invoiceEntry, getBundleId, addon_name, bundle_cb) {
  OperatorSetting.findOne({ raw: true, where: { org_id: request.org_id } }).then(function (oper) {
    Org.findOne({ raw: true, where: { reseller_org_id: oper.reseller_org_id, org_type: 'RESELLER' } }).then(function (reseller_oper) {
      var month = keyObj[request.mode];
      if (subscription_bund.length > 0) {
        subscription_bund.map(function (ip, i) {
          ip.org_id = request.org_id;
          getBundleId.push(ip.bundle_id);
          addon_name = (addon_name == '') ? ip.bundle_name : addon_name + ', ' + ip.bundle_name
          if (reseller_oper.provider_type == 'Independent' && ip.reseller_bundle_type == 'Base Bundle') {
            res_bund_name = ip.bundle_name
          } else {
            res_bund_name = (addon_name == '') ? ip.bundle_name : addon_name + ', ' + ip.bundle_name
          }
          var flag = (request.bulkCreate) ? request.arr.length : 1
          var invoice_obj = {
            bund_name: ip.bundle_name,
            mode: request.mode,
            quantity: flag,
            status: 'Payment'
          };
          if (ip.bundle_type == 'custompackage') {
            invoice_obj['amt'] = (ip.bundle_cost * flag);
            invoice_obj['rate'] = ip.bundle_cost;
          } else {
            invoice_obj['amt'] = (ip[month] * flag);
            invoice_obj['rate'] = ip[month];
          };
          invoiceEntry.invoices.push(invoice_obj);
          // if (!ip.iptv && ott_flag && request.stb && request.app) {
          //   var invoice_object = {
          //     bund_name: ip.bundle_name,
          //     mode: request.mode,
          //     quantity: flag,
          //     status: 'Payment',
          //     discount: oper.discount + '% discount'
          //   }
          //   invoiceEntry.invoices.push(invoice_object);
          //   if (ip.bundle_type == 'custompackage') {
          //     invoice_object['amt'] = (ip.bundle_cost - (ip.bundle_cost * oper.discount / 100));
          //     invoice_object['rate'] = ip.bundle_cost;
          //   } else {
          //     invoice_object['amt'] = (ip[month] - (ip[month] * oper.discount / 100));
          //     invoice_object['rate'] = ip[month];
          //   };
          // };
          if (i + 1 == subscription_bund.length) {
            bundle_cb(invoiceEntry, getBundleId, addon_name, res_bund_name)
          }
        });
      } else {
        res_bund_name = addon_name
        bundle_cb(invoiceEntry, getBundleId, addon_name, res_bund_name)
      }
    })
  })
}

function sms_call(m2m_payload, url, sms_ids, user_id, subscription_flag) {
  if (sms_ids.length > 0) {
    BundlePackage.findAll({ raw: true, where: { bundle_id: sms_ids }, attributes: { exclude: ['id', 'createdAt', 'updatedAt'] } }).then(function (bun) {
      if (subscription_flag != 'delete') {
        bun = bun.filter(function (thing, index) {
          delete thing.id
          return index == bun.findIndex(function (obj) {
            return obj.package_id === thing.package_id;
          });
        });
      }
      var pro_id = bun[0].provider_id;
      Provider.findOne({ raw: true, where: { provider_id: pro_id } }).then(function (provider) {
        var start_date = (m2m_payload.customer && m2m_payload.customer.length > 0) ? m2m_payload.customer[0].start_date : m2m_payload.start_date
        if (subscription_flag != 'delete') {
          bun.map(function (input) {
            input.status = 'COMPLETED';
            input.start_date = start_date;
            if (input.package_name.includes('-')) {
              var iptv_package_name = input.package_name.split('-');
              input.package_name = iptv_package_name[1];
            }
          });
          m2m_payload['package'] = bun;
          m2m_payload['user_id'] = user_id;
        }
        var obj = HTTPCli.M2MReq(provider.sms_host, provider.sms_port, 'POST', m2m_payload, url, provider.sms_token);
        console.log("--------obj",obj)
        HTTPCli.https_to_SMS(obj, sucess_cb, error_cb);
        function error_cb(err) {
          m2m_payload['sms_host'] = provider.sms_host;
          m2m_payload['sms_port'] = provider.sms_port;
          m2m_payload['sms_token'] = provider.sms_token;
          m2m_payload['api'] = url;
          var retry_key = 'payload' + random_number(options);
          m2m_payload['retry_key'] = retry_key;
          sms_retry.set(retry_key, m2m_payload);
          sms_retry.save();
        };
        function sucess_cb(data) {
          D && console.log("sucess", data);
        };
      });
    });
  };
};

function transaction_invoice(request, org, payable_amt, ott_flag, adjustable_pay, retainer_id, getBundleId, org_provider_flag, orgs_reseller, reseller_pay, cback) {
  var addon_name = '';
  var month = keyObj[request.mode];
  var adjust = adjustable_pay;
  Transaction.findOne({ raw: true, where: { invoice_year: new Date().getFullYear() }, order: [['trans_id', 'DESC']], limit: 1 }).then(function (trans) {
    var invoiceEntry = {
      org_id: org.org_id,
      org_name: org.org_name,
      reseller_org_id: org.reseller_org_id,
      type: 'Debit',
      status: (adjust == true) ? 'Pending' : 'Approved',
      payment_method: 'Offline',
      criteria: 'Direct',
      total_amount: payable_amt,
      retainer_invoice_id: retainer_id,
      invoices: []
    };
    if (adjust) {
      if (request.bundle) {
        var invoice_entry = {
          bund_name: request.bundle,
          mode: request.mode,
          quantity: request.quantity,
          status: 'Payment'
        }
        invoiceEntry['invoices'] = [
          {
            bund_name: request.bundle,
            mode: request.mode,
            status: 'Adjustment',
            amt: request.account_balance
          }
        ]
        invoiceEntry.invoices.push(invoice_entry)
        if (request.bundle_type == 'custompackage') {
          invoice_entry['rate'] = request.bundle_cost;
          invoice_entry['amt'] = (request.bundle_cost * request.quantity);
        } else {
          invoice_entry['rate'] = request.rate;
          invoice_entry['amt'] = (request.rate * request.quantity);
        };
      };
    };
    if (trans) {
      if (trans.invoice_year == new Date().getFullYear()) {
        invoiceEntry.invoice_acc_id = trans.invoice_acc_id + 1
        invoiceEntry.invoice_year = new Date().getFullYear()
        invoiceEntry.invoice_id = 'INV-' + invoiceEntry.invoice_year + 'AC' + invoiceEntry.invoice_acc_id
      } else {
        invoiceEntry.invoice_acc_id = 1
        invoiceEntry.invoice_year = new Date().getFullYear()
        invoiceEntry.invoice_id = 'INV-' + invoiceEntry.invoice_year + 'AC' + invoiceEntry.invoice_acc_id
      };
    } else {
      invoiceEntry.invoice_acc_id = 1
      invoiceEntry.invoice_year = new Date().getFullYear()
      invoiceEntry.invoice_id = 'INV-' + invoiceEntry.invoice_year + 'AC' + invoiceEntry.invoice_acc_id
    };
    if (org_provider_flag) {
      var reseller_invoiceEntry = {
        org_id: orgs_reseller.org_id,
        org_name: orgs_reseller.org_name,
        reseller_org_id: orgs_reseller.reseller_org_id,
        type: 'Debit',
        status: (adjust == true) ? 'Pending' : 'Approved',
        payment_method: 'Offline',
        criteria: 'Direct',
        total_amount: reseller_pay,
        retainer_invoice_id: retainer_id,
        invoices: []
      };
      if (orgs_reseller.provider_type == 'Independent' && request.subscription_bundles) {
        var res_bundle = ''
        request.subscription_bundles.map(function (sub) {
          if (sub.reseller_bundle_type == 'Base Bundle') {
            res_bundle = sub.bundle_name
          }
        })
        reseller_invoiceEntry['invoices'] = [
          {
            bund_name: res_bundle,
            mode: request.mode,
            status: 'Adjustment',
            amt: reseller_pay
          }
        ]
      };
      if (trans) {
        if (trans.invoice_year == new Date().getFullYear()) {
          reseller_invoiceEntry.invoice_acc_id = trans.invoice_acc_id + 2
          reseller_invoiceEntry.invoice_year = new Date().getFullYear()
          reseller_invoiceEntry.invoice_id = 'INV-' + reseller_invoiceEntry.invoice_year + 'AC' + reseller_invoiceEntry.invoice_acc_id
        } else {
          reseller_invoiceEntry.invoice_acc_id = 1
          reseller_invoiceEntry.invoice_year = new Date().getFullYear()
          reseller_invoiceEntry.invoice_id = 'INV-' + reseller_invoiceEntry.invoice_year + 'AC' + reseller_invoiceEntry.invoice_acc_id
        };
      } else {
        reseller_invoiceEntry.invoice_acc_id = 1
        reseller_invoiceEntry.invoice_year = new Date().getFullYear()
        reseller_invoiceEntry.invoice_id = 'INV-' + reseller_invoiceEntry.invoice_year + 'AC' + reseller_invoiceEntry.invoice_acc_id
      };
    }
    request.subscription_bundles = (request.subscription_bundles == undefined) ? [] : request.subscription_bundles;
    bundle_invoice(request, request.subscription_bundles, invoiceEntry, getBundleId, addon_name, function (data, bundle_id, addon_name, res_bund_name) {
      var bundle_list = []
      if (request.newarr) { bundle_list = request.newarr }
      if (request.newarr_on_edit) { bundle_list = request.newarr_on_edit }
      bundle_invoice(request, bundle_list, invoiceEntry, getBundleId, addon_name, function (datas, bundle_id, addon_name, res_bund_name) {
        invoiceEntry.invoices.push({ bund_name: addon_name, mode: request.mode, status: 'Adjustment', amt: payable_amt });
        reseller_invoiceEntry.invoices.push({ bund_name: res_bund_name, mode: request.mode, status: 'Adjustment', amt: reseller_pay });
        invoiceEntry['bundle'] = addon_name;
        invoiceEntry['total_amount'] = payable_amt;
        invoiceEntry['paid_amount'] = 0;
        reseller_invoiceEntry['bundle'] = res_bund_name;
        reseller_invoiceEntry['total_amount'] = reseller_pay;
        reseller_invoiceEntry['paid_amount'] = 0;
        cback(invoiceEntry, reseller_invoiceEntry, bundle_id);
      })
    })
  });
};

function multipleCreate(subscription, bulkfinal, subPackArr, invoiceEntry, reseller_invoiceEntry, cb) {
  subscription.map(function(sub_data){
    Subscription.create(sub_data).then(function (subs) {
      SubscriptionBundle.bulkCreate(bulkfinal).then(function (sub_bundle) {
        SubscriptionPackage.bulkCreate(subPackArr).then(function (sub_pack) {
          Transaction.create(invoiceEntry, { include: [Invoice] }).then(function (trans) {
            Transaction.create(reseller_invoiceEntry, { include: [Invoice] }).then(function (res_trans) {
              if(subs){
                cb(200, "Subscription Created Successfully");
              }
            })
          });
        });
      });
    }, function (err) {
      if (err && err.errors[0].message) {
        return cb(500, err.errors[0].message);
      };
      cb(500, "Subscription creation failed");
    });
  });
};

  function generateMAC(){
        var mac="XX:XX:XX:XX:XX:XX".replace(/X/g, function() {
                return "0123456789ABCDEF".charAt(Math.floor(Math.random() * 16))
        })
//      console.log('mac',mac)
        return mac
  }

//generateMAC();

SubscriberBulk.create = function () {
console.log('Enter to bulk create...')
  function guid() {
    function s4() {
      return Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .substring(1)
    }
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4()
  }


  var array = [{
    index: 0,
    name: 'NewSub-57',
    email: 'newsubo901@yahoo.com',
    mobile: '232211000',
    bundle: 'Custom OTT (Zee, Ullu)',
    mode: 'One Month',
    amount: 0,
    allowed_device: 'mobile+tv+stb',
    stb: true,
    app: false,
    mac_address: '08:62:10:60:88:72',
    stb_type: 'SKIE 100',
    autorenewal: true,
    renewal_type: 'no_auto_renew'
  }]

  var req = {};
  req.orgId = 'e57f49dc-d145-7ced-e3f7-5d7724353918';
  req.userId = 'f63c2ee0-0272-11ed-b406-056c333f164a';
  var orgName = 'paopertwo';
  req.body = {
    "subscription_id":"159ebe3d-705c-4a2e-746e-d5de096c7ee6",
    "name":"Testing001 ",
    "email":"test@gagag.com",
    "bundle":"pares ott",
    "mobile":"8989198199",
    "mode":"One Month",
    "amount":0,
    "autorenewal":true,
    "bulkCreate":true,
    "add_on":true,
    "arr":[],
    "subscription_bundles":[
        {
            "bundle_id":"65241c59-08da-110e-8336-f6782fe8f5bd",
            "bundle_name":"pares ott",
            "price_one_month":null,
            "price_three_month":null,
            "price_six_month":null,
            "price_twelve_month":null,
            "moq":null,
            "add_on":false,
            "iptv":false,
            "bundle_type":"resellerpackage",
            "bundle_mode":"One Month",
            "bundle_cost":0,
            "is_external_packages":false,
            "ott_price":100,
            "recommend_cost":100,
            "seller_cost":110,
            "reseller_bundle_type":"Base Bundle",
            "org_id":"54308907-ec45-52b1-fffd-fb4b7ea735b8",
            "operator_margin":1,
            "allowed_device":null,
            "bundle_reseller_custom_packages":[
            ],
            "bundle_grouped_packages":[
            ],
            "addon":false,
            "base":true,
            "subscription_id":"159ebe3d-705c-4a2e-746e-d5de096c7ee6"
        },
        {
            "bundle_id":"197b49d0-fd1a-11ec-8e7b-cd7a2de63b5d",
            "bundle_name":"int provider-demo 5",
            "price_one_month":0,
            "price_three_month":0,
            "price_six_month":0,
            "price_twelve_month":0,
            "add_on":true,
            "iptv":true,
            "bundle_type":"bundlepackage",
            "bundle_mode":"One Month",
            "bundle_cost":0,
            "is_external_packages":null,
            "ott_price":null,
            "recommend_cost":null,
            "seller_cost":null,
            "reseller_bundle_type":null,
            "org_id":null,
            "operator_margin":null,
            "allowed_device":null,
            "bundlepackages":[
                {
                    "id":346,
                    "package_id":"e9568130-03ee-73aa-79a4-6b65745a39aa",
                    "package_name":"demo 5",
                    "provider_name":"int provider",
                    "provider_id":"d2343c00-fd12-11ec-ba53-e1b91a9f17ce",
                    "provider_category":"LIVE",
                    "createdAt":"2022-07-06 16:25:08",
                    "updatedAt":"2022-07-06 16:25:08",
                    "bundle_id":"197b49d0-fd1a-11ec-8e7b-cd7a2de63b5d"
                }
            ],
            "bundle_reseller_custom_packages":[
            ],
            "bundle_grouped_packages":[
            ],
            "bundle_custom_external_packages":[
            ],
            "addon":true,
            "base":false,
            "addon_status":true,
            "subscription_id":"159ebe3d-705c-4a2e-746e-d5de096c7ee6",
            "id":1
        },
        {
            "bundle_id":"3fc56970-55ae-7d26-ae0f-747c644363e9",
            "bundle_name":"Bundle_paoper_NCF",
            "price_one_month":1,
            "price_three_month":3,
            "price_six_month":6,
            "price_twelve_month":12,
            "moq":1,
            "add_on":1,
            "iptv":1,
            "bundle_type":"bundlepackage",
            "bundle_mode":null,
            "bundle_cost":0,
            "is_external_packages":null,
            "ott_price":null,
            "recommend_cost":null,
            "seller_cost":null,
            "reseller_bundle_type":null,
            "org_id":null,
            "operator_margin":null,
            "allowed_device":null,
            "createdAt":"2022-07-13 12:15:48",
            "updatedAt":"2022-07-13 12:15:48",
            "addon":true,
            "base":false,
            "addon_status":"true"
        }
    ],
    "serial_no":"test-7062000",
    "mac_address":"07:62:10:60:88:69",
    "stb_type":"test8",
    "checkIptv":true,
    "stb":true,
    "app":false,
    "renewal_type":"no_auto_renew",
    "bundle_type":"package",
    "allowed_device":"mobile+tv+stb"

}
  var unique = '3300103041';
  var length = 3;
  var emm_arr = [];
  for (i = 0; i <= length; i++) {
    given_data = array[0]
    var given_datas = {}
    given_datas.index = (Number(given_data.index) + i)
    given_datas.mobile = (Number(given_data.mobile) + i)
    var sub_name = given_data.name.split('-')
    given_datas.name = sub_name[0] + '-' + (Number(sub_name[1]) + i)
    var email = given_data.email.split('@')
    given_datas.email = email[0].split('0')[0] + '0' + (Number(email[0].split('0')[1]) + i) + '@' + email[1]
    var prefix = 'INFYN'
    given_datas.serial_no = prefix + (Number(unique) + i)
    given_datas.subscription_id = guid()
    given_datas.allowed_device = given_data.allowed_device
    given_datas.stb = given_data.stb
    given_datas.app = given_data.app
    given_datas.amount = given_data.amount
    given_datas.mac_address = generateMAC()
    given_datas.stb_type = given_data.stb_type
    given_datas.autorenewal = given_data.autorenewal
    given_datas.renewal_type = given_data.renewal_type
    given_datas.bundle = given_data.bundle
    given_datas.mode = given_data.mode
        //console.log('req.body',given_datas)
    var emm_obj_entry = {
          status : 'Active',
          unique_id : given_datas.serial_no,
          mac_address : given_datas.mac_address,
          model : 'SKIE100',
          make : 'INFYN',
          org_id : req.orgId,
          org_name : orgName
    }
    emm_arr.push(emm_obj_entry)
    req.body.arr.push(given_datas)
    if (i + 1 == length) {
      process()
    }
  }
   function process() {
    EMM.bulkCreate(emm_arr).then(function(emm_creation){
        console.log("EMM CREATION",emm_creation.length)
    })
    var bulkfinal = [], sms_ids = [], external_bundle_ids = [], getBundleId = [];
    Org.findOne({ raw: true, where: { org_id: req.orgId } }).then(function (org) {
      Org.findOne({ raw: true, where: { reseller_org_id: org.reseller_org_id, org_type: 'RESELLER' } }).then(function (orgs_reseller) {
        BundleResellerCustomPackage.findAll({ raw: true }).then(function (bundle_reseller) {
          BundleGroupedPackage.findAll({ raw: true }).then(function (grp_bundle) {
            var org_provider_type = orgs_reseller.provider_type;
            var org_provider_flag = ((org_provider_type == 'Independent') || (org_provider_type == 'Partner')) ? true : false;
            creditCalculation.Calculate({ org_id: orgs_reseller.org_id }, res_cb)
            function res_cb(argument) {
                console.log('reseller credit status.....',argument)
              if (argument.status == 200) {
                var reseller_account_balance = Number(argument.msg.object.toFixed(2));
                OperatorSetting.findOne({ raw: true, where: { org_id: req.orgId } }).then(function (oper) {
                  var org_address = org.city + ', ' + org.state + ', ' + org.pincode;
                  var days = (renewalObj[req.body.mode]);
                  var active_date = new Date().setHours(0, 0, 0, 0);
                  var expiry = new Date();
                  var expiryDate = new Date(expiry.setDate(expiry.getDate() + days)).setHours(23, 59, 59, 999);
                  creditCalculation.Calculate({ org_id: org.org_id }, cb)
                  function cb(data) {
                        console.log('Operator credit status...........',data)
                    if (data.status == 200) {
                      var account_balance = 0, payable_amt = 0, add_on_without_gst = 0, ott_amt = 0, ott_amt_with_gst = 0;
                      account_balance = Number(data.msg.object.toFixed(2));
                      var month = keyObj[req.body.mode];
                      var add_on_with_gst;
                      var reseller_cost = 0;
                      var ott_flag = false;
                      if (req.body.bulkCreate) {
                       Subscription.findAll({ raw: true }).then(function (checkSubs) {
                          var dupeArr = [];
                          req.body.arr.map(function (input) {
                            if (checkSubs.some(function (item) { return ((item.email == input.email) || (item.mobile == input.mobile)) || (item.serial_number == input.serial_no) })) {
                              dupeArr.push(input)
                            }
                          });
                          if (dupeArr.length > 0) {
                                console.log('Duplicate entries.......')
                            console.log("DUPLICATE ERR",dupeArr)
                          } else {
                                console.log('Enter to subscription creation.....')
                            var subscription = req.body.arr;
                            var bundles = req.body.subscription_bundles;
                            var sub_id = [];
                            for (var i = 0; i < subscription.length; i++) {
                              var sub_index = subscription[i];
                              sub_index.mobile = sub_index.mobile;
                              sub_id.push(sub_index.subscription_id);
                              sub_index.status = 'New';
                              sub_index.checkIptv = req.body.checkIptv
                              sub_index.org_id = org.org_id;
                              sub_index.reseller_org_id = org.reseller_org_id;
                              sub_index.expires_on = expiryDate;
                              sub_index.activated_on = new Date().setHours(0, 0, 0, 0);
                              var subscription_id = sub_index.subscription_id;
                              for (var j = 0; j < bundles.length; j++) {
                                var bundle_index = bundles[j];
                                getBundleId.push(bundle_index.bundle_id);
                                delete bundle_index.id
                                bundle_index.subscription_id = subscription_id
                                bundle_index.org_id = org.org_id;
                                var copied_bundle = Object.assign({}, bundle_index);
                                bulkfinal.push(copied_bundle);
                                if (bundle_index.is_external_packages) {
                                  external_bundle_ids.push(bundle_index.bundle_id);
                                };
                                if (bundle_index.bundle_type == resellerpackage) {
                                  if ((!bundle_index.bundle_name.includes('NCF')) && (!bundle_index.addon)) {
                                    if (org_provider_type == 'Independent') {
                                      reseller_cost += bundle_index.ott_price;
                                    } else {
                                      reseller_cost += bundle_index.recommend_cost;
                                    }
                                  }
                                  var bun_res_filter = bundle_reseller.filter(function (bund_res) {
                                    return (bund_res.bundle_id == bundle_index.bundle_id)
                                  })
                                  add_on_without_gst += bundle_index.seller_cost
                                  bundle_index.org_id = org.org_id;
                                  if (bun_res_filter.length > 0) {
                                    bun_res_filter.map(function (item) {
                                      // if(!item.iptv){
                                      //   ott_flag = true;
                                      //   ott_amt = item[month]
                                      // }
                                      getBundleId.push(item.reseller_custom_bundle_id)
                                    })
                                  }
                                } else {
                                  // if (!bundle_index.iptv) {
                                  //   ott_flag = true
                                  //   if ((bundle_index.bundle_type == bundlepackage) || (bundle_index.bundle_type == externalpackage) || (bundle_index.bundle_type == custompackage)) {
                                  //     ott_amt = (bundle_index.bundle_type == custompackage) ? (ott_amt + (bundle_index.bundle_cost)) : (ott_amt + (bundle_index[month]));
                                  //   };
                                  // };
                                  if ((bundle_index.bundle_type == bundlepackage) || (bundle_index.bundle_type == externalpackage) || (bundle_index.bundle_type == custompackage)) {
                                    add_on_without_gst = (bundle_index.bundle_type == custompackage) ? (add_on_without_gst + (bundle_index.bundle_cost)) : (add_on_without_gst + (bundle_index[month]));
                                  };
                                }
                              };
                            };
                            reseller_cost_with_gst = Number((reseller_cost + ((reseller_cost * 18) / 100)).toFixed(2));
                            add_on_with_gst = Number((add_on_without_gst + ((add_on_without_gst * 18) / 100)).toFixed(2));
                            payable_amt = add_on_with_gst;
                            BundlePackage.findAll({ raw: true, where: { bundle_id: getBundleId }, attributes: { exclude: ['id'] } }).then(function (bundlepack) {
                              var bundlepack = bundlepack.filter(function (thing, index) {
                                delete thing.id
                                return index === bundlepack.findIndex(function (obj) {
                                  return obj.package_id === thing.package_id;
                                });
                              });
                              var subPackArr = [];
                              sub_id.map(function (property) {
                                bundlepack.map(function (bp) {
                                  bp.expiry_date = expiryDate
                                  bp.subscription_id = property
                                  var copied_pack = Object.assign({}, bp);
                                  subPackArr.push(copied_pack)
                                });
                              });
                              if (reseller_account_balance >= reseller_cost_with_gst) {
                                console.log('Reseller balance satisfield....')
                                if (account_balance >= payable_amt) {
                                        console.log('operator balance satisfied.....')
                                  req.body.org_id = req.orgId;
                                  transaction_invoice(req.body, org, payable_amt, ott_flag, false, null, getBundleId, org_provider_flag, orgs_reseller, reseller_cost_with_gst, function (invoiceEntry, reseller_invoiceEntry, getBundleId, addon_name) {
                                    req.body.arr.map(function (emm_bulk) {
                                      EMM.update({ status: 'Active' }, { where: { unique_id: emm_bulk.serial_no } }).then(function (emm_updated) { });
                                    })
                                    if (reseller_invoiceEntry.total_amount == 0) {
                                      reseller_invoiceEntry = {}
                                    }
                                    multipleCreate(subscription, bulkfinal, subPackArr, invoiceEntry, reseller_invoiceEntry, function (status, cb_data) {
                                      if (status == 200) {
                                        if (req.body.checkIptv) {
                                                console.log('IPTV request initiated........')
                                          var m2m_payload;
                                          req.body.subscription_bundles.map(function (pos, i) {
                                            if (!pos.bundle_name.includes('NCF')) {
                                              if (pos.bundle_type == 'resellerpackage') {
                                                var res_pack = pos.bundle_reseller_custom_packages
                                                res_pack.map(function (res_data) {
                                                  if (res_data.iptv) {
                                                    sms_ids.push(res_data.reseller_custom_bundle_id)
                                                  } else {
                                                    var grp_filter = grp_bundle.filter(function (grp_entry) {
                                                      return grp_entry.bundle_id == res_data.reseller_custom_bundle_id
                                                    })
                                                    grp_filter.map(function (ip) {
                                                      if (ip.iptv) {
                                                        sms_ids.push(ip.grouped_bundle_id)
                                                      }
                                                    })
                                                  }
                                                })
                                              } else {
                                                if (pos.iptv) {
                                                  sms_ids.push(pos.bundle_id)
                                                };
                                              }
                                              if (i + 1 == req.body.subscription_bundles.length) {
                                                process()
                                              }
                                            }
                                          });
                                          req.body.arr.map(function (like) {
                                            like.activation_code = JSON.stringify(generateActivationCode(like.email, org.short_code));
                                            like.user_id = req.userId;
                                            like.org_id = req.orgId;
                                            like.org_name = org.org_name;
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
                                          });
                                          m2m_payload = {
                                            customer: req.body.arr,
                                          };
                                        };
                                        var url = '/api/partner/subscription';
                                        if (external_bundle_ids.length > 0) {
                                                console.log('Enter to external apps  API..............')
                                          Subscription.findAll({ where: { subscription_id: sub_id }, include: [SubscriptionBundle] }).then(function (sub_datas) {
                                            external_apps_call('multiple', sub_datas, external_bundle_ids, expiryDate, function (argument) {
                                                console.log('SMS API call initiated..............')
                                              sms_call(m2m_payload, url, sms_ids, req.userId, 'create')
                                            })
                                          })
                                        } else {
                                          console.log("----else call")
                                          sms_call(m2m_payload, url, sms_ids, req.userId, 'create')
                                        }
                                      } else {
                                        console.log("FAILED")
                                      };
                                    });
                                  });
                                } else {
                                  adjust_pay();
                                };
                              } else {
                                console.log("Insufficient Balance. Please contact your reseller")
                              }
                            });
                          };
                        });
                      };
                      function adjust_pay() {
                        if (account_balance > 0) {
                          var msg = "Rs " + account_balance + " been adjusted with the credit"
                        } else {
                          var msg = "No Credit available please make the payment to proceed!"
                        }
                        var finalAmt = payable_amt - account_balance;
                        console.log("AMOUNT NOT SUFFICIENT")
                      };
                    };
                  };
                });
              }
            }
          });
        })
      })
    })
  }
}
function external_apps_call(flag, request, external_bundle_ids, expiryDate, external_cb) {
  var coupon_arr = [], empty_coupon_arr = [], remove_flag = 'true';
  var request_data = request;
  if (flag == 'single') {
    org_id = request.org_id;
  } else if (flag == 'multiple') {
    org_id = request[0].org_id;
    // request_data = request.arr;
  } else {
    org_id = request[0].org_id
    request_data = request;
  }
  Bundle.findAll({ include: [{ model: BundleCustomExternalPackage }, { model: BundleExternalPackage }] }).then(function (total_bundle) {
    Org.findOne({ raw: true, where: { org_id: org_id } }).then(function (org) {
      SubscriberExternalApp.findAll({ raw: true }).then(function (all_subscriber_app) {
        Coupon.findAll({ raw: true, where: { subscribed: false } }).then(function (coupons) {
          BundleCustomExternalPackage.findAll({ raw: true, where: { bundle_id: external_bundle_ids } }).then(function (all_custom_bundle) {
            var custom_ids = [];
            all_custom_bundle.map(function (line) {
              custom_ids.push(line.custom_external_bundle_id)
            })
            BundleExternalPackage.findAll({ raw: true, where: { bundle_id: custom_ids } }).then(function (all_extern_pack) {
              var app_ids = [];
              all_extern_pack.map(function (lines) {
                app_ids.push(lines.external_app_id)
              })
              ExternalApp.findAll({ raw: true, where: { external_app_id: app_ids } }).then(function (all_extern_app) {
                var subscriber_external_apps_arr = [];
                all_extern_app.map(function (row, i) {
                  var code_data = code_obj[request.mode];
                  subscriber_external_apps_arr.push({
                    external_app_name: row.name,
                    external_package_name: row.package_name,
                    activation_type: row.activation_type,
                    expiry_date: expiryDate,
                    code: row[code_data],
                    remove: 'false',
                    org_name: org.org_name,
                    is_issued: false,
                    external_app_id: row.external_app_id
                  })
                  if ((i + 1) == all_extern_app.length) {
                    var subscriber_apps_arr = []
                    if (flag == 'single') {
                      subscriber_external_apps_arr.map(function (obj) {
                        obj['subscriber_id'] = request.subscription_id
                        obj['mobile'] = request.mobile
                        obj['mode'] = request.mode
                        obj['name'] = request.name
                      })
                      subscriber_apps_arr = subscriber_external_apps_arr;
                    } else {
                      for (var i = 0; i < request_data.length; i++) {
                        var sub_index = request_data[i]
                        var subscription_id = sub_index.subscription_id;
                        for (var k = 0; k < request_data[i].subscription_bundles.length; k++) {
                          total_bundle.map(function (proc) {
                            if ((proc.bundle_id == request_data[i].subscription_bundles[k].bundle_id) && proc.is_external_packages) {
                              all_custom_bundle.map(function (input) {
                                if ((request_data[i].subscription_bundles[k].bundle_id == input.bundle_id)) {
                                  all_extern_pack.map(function (iter) {
                                    if (iter.bundle_id == input.custom_external_bundle_id) {
                                      for (var j = 0; j < subscriber_external_apps_arr.length; j++) {
                                        if (subscriber_external_apps_arr[j].external_app_id == iter.external_app_id) {
                                          var bundle_index = subscriber_external_apps_arr[j];
                                          bundle_index['subscriber_id'] = sub_index.subscription_id
                                          bundle_index['mobile'] = sub_index.mobile
                                          bundle_index['mode'] = sub_index.mode
                                          bundle_index['name'] = sub_index.name
                                          delete bundle_index.id
                                          var sub_copied_bundle = Object.assign({}, bundle_index);
                                          subscriber_apps_arr.push(sub_copied_bundle)
                                        }
                                      }
                                    }
                                  })
                                }
                              })
                            }
                          })
                        }
                      }
                    }
                    let message = (
                      'Dear Support, <br><br>' +
                      'Subscriber Details and his Activated External App details <br><br>' +
                      '<table style="border-collapse: collapse;">' +
                      '<thead>' +
                      '<th style="border: 1px solid #333;"> Subscriber Name </th>' +
                      '<th style="border: 1px solid #333;"> Mobile Number </th>' +
                      '<th style="border: 1px solid #333;"> Operator Name </th>' +
                      '<th style="border: 1px solid #333;"> Mode </th>' +
                      '<th style="border: 1px solid #333;"> List of External Apps </th>' +
                      '</thead>'
                    )
                    var sub_app_obj = {}
                    subscriber_apps_arr.map(function (row, j) {
                      var id = row.subscriber_id
                      if (sub_app_obj[id] == undefined) {
                        sub_app_obj[id] = { data: row, pack: row.external_app_name }
                      } else {
                        var get_data = sub_app_obj[id]
                        get_data.pack = get_data.pack + ', ' + row.external_app_name
                      }
                      var exist_coupon = [];
                      all_subscriber_app.map(function (input) {
                        if ((input.subscriber_id == row.subscriber_id) && (input.external_package_name == row.external_package_name) && ((new Date(input.expiry_date).getTime()) >= (new Date().getTime()))) {
                          exist_coupon = [input]
                        }
                      })
                      if (exist_coupon.length == 0) {
                        if ((row.activation_type == 'Coupon')) {
                          var availableCoupon = [];
                          coupons.map(function (index) {
                            if ((index.subscribed == false) && (index.external_package_name == row.external_package_name) && (index.coupon_validity == row.mode)) {
                              availableCoupon = [index];
                            }
                          })
                          if (availableCoupon.length > 0) {
                            coupon_arr.push(availableCoupon[0].coupon)
                            coupons.splice(coupons.findIndex(({ coupon }) => coupon == availableCoupon[0].coupon), 1);
                          } else {
                            var code_data = code_obj[request.mode];
                            empty_coupon_arr.push({
                              external_app_name: row.external_app_name,
                              external_package_name: row.external_package_name,
                              code: row.code,
                              coupon_validity: row.mode,
                              subscribed: true,
                              issued: false
                            })
                          }
                        }
                      } else {
                        row.remove = 'true'
                      }
                      if (j + 1 == subscriber_apps_arr.length) {
                        subscriber_apps_arr = subscriber_apps_arr.filter(function (obj) {
                          return obj.remove == 'false';
                        });
                        data_process();
                      }
                    })
                    function data_process() {
                      Coupon.update({ subscribed: true }, { where: { coupon: coupon_arr } }).then(function (update_coupon) {
                        Coupon.bulkCreate(empty_coupon_arr).then(function (create_coupon) {
                          SubscriberExternalApp.bulkCreate(subscriber_apps_arr).then(function (sub_extern_app) {
                            Coupon.findAll({ raw: true }).then(function (coupon_data) {
                              var check_index = 0;
                              var app_size = Object.keys(sub_app_obj).length
                              for (n in sub_app_obj) {
                                var app_pack = sub_app_obj[n]
                                check_index++
                                message += (
                                  '<tr>' +
                                  '<td style="border: 1px solid #333;">' + app_pack.data.name + '</td>' +
                                  '<td style="border: 1px solid #333;">' + app_pack.data.mobile + '</td>' +
                                  '<td style="border: 1px solid #333;">' + app_pack.data.org_name + '</td>' +
                                  '<td style="border: 1px solid #333;">' + app_pack.data.mode + '</td>' +
                                  '<td style="border: 1px solid #333;">' + app_pack.pack + '</td>' +
                                  '</tr>'
                                )
                                if (check_index == app_size) {
                                  message += (
                                    '</table><br><br>' +
                                    'Total , subscribed and Issued  Coupon count of all external Apps<br><br>'
                                  )
                                  coupon_list()
                                }

                              }
                              function coupon_list() {
                                var coupon_obj = {};
                                coupon_data.map(function (iter, x) {
                                  if (coupon_obj[iter.external_app_name] == undefined) {
                                    var total_value = 1
                                    var subscribed_value = ((iter.subscribed == true) && (iter.issued == false) && (iter.coupon != null)) ? 1 : 0
                                    var issued_value = ((iter.issued == true) && (iter.subscribed == true) && (iter.coupon != null)) ? 1 : 0
                                    var empty_value = (iter.coupon == null) ? 1 : 0
                                    var total_subscribed = subscribed_value + issued_value;
                                    var unused = total_value - total_subscribed;
                                    coupon_obj[iter.external_app_name] = { total: total_value, subscribed: subscribed_value, issued: issued_value, empty: empty_value, pack_name: iter.external_package_name, total_subscribed: total_subscribed, unused: unused };
                                  } else {
                                    var coupon_template = coupon_obj[iter.external_app_name]
                                    subscribed_value = ((iter.subscribed == true) && (iter.issued == false) && (iter.coupon != null)) ? (coupon_template.subscribed + 1) : coupon_template.subscribed;
                                    issued_value = ((iter.issued == true) && (iter.subscribed == true) && (iter.coupon != null)) ? (coupon_template.issued + 1) : coupon_template.issued
                                    empty_value = (iter.coupon == null) ? (coupon_template.empty + 1) : coupon_template.empty
                                    total_value = coupon_template.total + 1
                                    total_subscribed = subscribed_value + issued_value;
                                    unused = total_value - total_subscribed;

                                    coupon_obj[iter.external_app_name] = { total: total_value, subscribed: subscribed_value, issued: issued_value, empty: empty_value, pack_name: iter.external_package_name, total_subscribed: total_subscribed, unused: unused };
                                  }
                                  if (x + 1 == coupon_data.length) {
                                    var count = 0
                                    var size = Object.keys(coupon_obj).length;
                                    message += (
                                      '<table style="border-collapse: collapse;">' +
                                      '<thead>' +
                                      '<th style="border: 1px solid #333;"> External App (1)</th>' +
                                      '<th style="border: 1px solid #333;"> Package Name (2)</th>' +
                                      '<th style="border: 1px solid #333;"> Total Coupons (3)</th>' +
                                      '<th style="border: 1px solid #333;"> Subscribed Coupons (4)<br>(5+6)</th>' +
                                      '<th style="border: 1px solid #333;"> Issued Coupons (5)</th>' +
                                      '<th style="border: 1px solid #333;"> UnSubscribed Coupons (6)</th>' +
                                      '<th style="border: 1px solid #333;"> Unused Coupons (7)<br>(3-4)</th>' +
                                      '<th style="border: 1px solid #333;"> Empty Coupons (8)</th>' +
                                      '</thead>'
                                    )
                                    for (j in coupon_obj) {
                                      count++;
                                      message += (
                                        '<tr>' +
                                        '<td style="border: 1px solid #333;">' + j + '</td>' +
                                        '<td style="border: 1px solid #333;">' + coupon_obj[j].pack_name + '</td>' +
                                        '<td style="border: 1px solid #333;">' + coupon_obj[j].total + '</td>' +
                                        '<td style="border: 1px solid #333;">' + coupon_obj[j].total_subscribed + '</td>' +
                                        '<td style="border: 1px solid #333;">' + coupon_obj[j].issued + '</td>' +
                                        '<td style="border: 1px solid #333;">' + coupon_obj[j].subscribed + '</td>' +
                                        '<td style="border: 1px solid #333;">' + coupon_obj[j].unused + '</td>' +
                                        '<td style="border: 1px solid #333;">' + coupon_obj[j].empty + '</td>' +
                                        '</tr>'
                                      )
                                      if (size == count) {
                                        message += (
                                          '</table><br><br>' +
                                          'Regards,<br>' +
                                          'Infynect Labs'
                                        )
                                        Mailer.sendMail(null, null, conf.get("support_mail"), null, message, null, 'Message From Skie');
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
  })

}

module.exports = SubscriberBulk;