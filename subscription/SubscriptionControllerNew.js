var express = require('express'),
  router = express.Router(),
  bodyParser = require('body-parser'),
  editJsonFile = require('edit-json-file'),
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
  resellerpackage = "resellerpackage",
  groupedpackage = "groupedpackage";

router.use(bodyParser.json({ limit: "4096mb", type: 'application/json' }));

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
  BundleGroupedPackage = __db_model.BundleGroupedPackage,
  PreActiveSubscription = __db_model.PreActiveSubscription,
  ProviderPackage = __db_model.ProviderPackage;

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
  'Twelve Month': 365
};
var renewalObj = {
  'One Month': 29,
  'Three Month': 89,
  'Six Month': 179,
  'Twelve Month': 364
};
var code_obj = {
  "One Month": "monthly_code",
  "Three Month": "quarterly_code",
  "Six Month": "halfyearly_code",
  "Twelve Month": "yearly_code"
};

function accessloginsWithOrg() {
  AccessLogin.findAll({ raw: true }).then(function (logins) {
    Subscription.findAll({ raw: true }).then(function (sub) {
      logins.map(function (item) {
        var number = item.phone_number;
        var subscriber = sub.filter(function (iter) {
          return iter.mobile == number;
        })
        updateLogins(number, subscriber[0].org_id)
      })
    })
  })
}
function updateLogins(number, org_id) {
  AccessLogin.update({ org_id: org_id }, { where: { phone_number: number } }).then(function (updated) { })
}
//.....Updating Existing Access Log in.....
//accessloginsWithOrg()

function stbSubscriber() {
  Org.findAll({ raw: true, where: { org_type: ['OPERATOR', 'HEPI_OPERATOR'] } }).then(function (org_data) {
    org_data.map(function (item) {
      var stb_flag = item.access_type_stb;
      Subscription.findAll({ raw: true, where: { org_id: item.org_id } }).then(function (data) {
        if (data.length > 0) {
          data.map(function (sub) {
            var subscriber_id = sub.subscription_id;
            var stb_data = false;
            if (sub.checkIptv || stb_flag) {
              stb_data = true;
            }
            updateSubscriber(stb_data, subscriber_id)
          })
        }
      })
    })
  })
}
function updateSubscriber(stb_data, subscriber_id) {
  Subscription.update({ stb: stb_data }, { where: { subscription_id: subscriber_id } }).then(function (sub_data) { })
}
//.....Updating Existing STB Box.....
//stbSubscriber()

function isEmpty(obj) {
  for (var key in obj) {
    if (obj.hasOwnProperty(key))
      return false;
  }
  return true;
}

function isCreditEmpty(obj) {
  if (typeof (obj) == 'number') return false;
  for (var key in obj) {
    if (obj.hasOwnProperty(key))
      return false;
  }
  return true;
}

function getTotalPages(data, limit, cb) {
  var arr = [];
  data.rows.map(function (argument, i) {
    argument = argument.get({ plain: true });
    argument.org_name = (argument.subscriberOrg && argument.subscriberOrg.org_name) ? argument.subscriberOrg.org_name : '';
    delete argument.subscriberOrg;
    arr.push(argument);
    if (i == data.rows.length - 1) {
      var roundoff = Math.round(data.count / limit);
      var page_list = data.count / limit;
      if (roundoff < page_list) {
        page_list = roundoff + 1;
      } else {
        page_list = roundoff;
      }
      var finalObj = {
        count: page_list,
        rows: arr
      }
      cb(finalObj);
    };
  });
};

function isCreditEmpty(obj) {
  if (typeof (obj) == 'number') return false;
  for (var key in obj) {
    if (obj.hasOwnProperty(key))
      return false;
  }
  return true;
}

function getPackages(exist_package) {
  var packages = {}
  for (var i = 0; i < exist_package.length; i++) {
    var pack_obj = exist_package[i];
    var package_id = pack_obj.package_id;
    packages[package_id] = pack_obj;
  }
  return packages;
}

var TYPE={
  SUCCESS:'SUCCESS',
  ERROR : 'ERROR',
  ENTRY : 'ENTRY'
}

function log(type,table_name,method,api,data,message){
  var log_data = "["+type+"]"+' '+table_name+' '+method+' '+api+' '+new Date()+' ('+message+')\n'+"Data "+JSON.stringify(data)+'\n\n'
  fs.appendFileSync('Logs.txt',log_data);
}

function sms_call(m2m_payload, url, sms_ids, user_id, subscription_flag, pre_set_flag) {
  if (sms_ids.length > 0) {
    var package_arr=[];
    BundlePackage.findAll({ raw: true, where: { bundle_id: sms_ids }, attributes: { exclude: ['id', 'createdAt', 'updatedAt'] } }).then(function (bun) {
      if (subscription_flag != 'delete') {
        bun = bun.filter(function (thing, index) {
          delete thing.id
          return index == bun.findIndex(function (obj) {
            return obj.package_id === thing.package_id;
          });
        });
        bun.map(function(item){
          package_arr.push(item.package_id)
        })
      }
      ProviderPackage.findAll({ raw: true, where: { package_id: package_arr } }).then(function(provider_package){
      var pro_id = bun[0].provider_id;
      Provider.findOne({ raw: true, where: { provider_id: pro_id } }).then(function (provider) {
        var start_date = (m2m_payload.customer && m2m_payload.customer.length > 0) ? m2m_payload.customer[0].start_date : m2m_payload.start_date
        if (subscription_flag != 'delete') {
          bun.map(function (input) {
            var amount=provider_package.filter(function(data){
              return data.package_id===input.package_id
            })
	    if(amount && amount.length>0){
            	input.charge=amount[0].amount
            	input.payable=amount[0].amount
            	input.charge_gst=Number((((input.charge * 18) / 100)).toFixed(2));
            	input.payable_gst=Number((((input.payable * 18) / 100)).toFixed(2));
	    }
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
        if (!pre_set_flag) {
          log(TYPE.ENTRY,'CUSTOMER-CREATE (NO PREACTIVATION)','POST',url,m2m_payload,"initiate customer creation");
          var obj = HTTPCli.M2MReq(provider.sms_host, provider.sms_port, 'POST', m2m_payload, url, provider.sms_token);
          HTTPCli.https_to_SMS(obj, sucess_cb, error_cb);
        }
        else {
          m2m_payload['sms_host'] = provider.sms_host;
          m2m_payload['sms_port'] = provider.sms_port;
          m2m_payload['sms_token'] = provider.sms_token;
          m2m_payload['api'] = url;
          var retry_key = 'payload' + random_number(options);
          m2m_payload['retry_key'] = retry_key;
          if(m2m_payload && m2m_payload.customer && m2m_payload.customer.length>0 && m2m_payload.customer[0].subscription_id){
            log(TYPE.ENTRY,'CUSTOMER-CREATE (PREACTIVATION)','DB','PreActiveSubscription',m2m_payload,"PreActiveSubscription entry created successfully");
          }else{
            log(TYPE.ENTRY,'CUSTOMER-CREATE (PREACTIVATION)','DB','PreActiveSubscription','{}',"PreActiveSubscription creation details not found");
          }
          var pre_payload = {
            subscription_id: m2m_payload.customer[0].subscription_id,
            entry: m2m_payload
          }
          PreActiveSubscription.create(pre_payload).then(function (pre_entry) { })
        }
        function error_cb(err) {
          log(TYPE.ERROR,'CUSTOMER-CREATE','POST',url,m2m_payload,"PreActiveSubscription creation failed in the SMS");
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
          log(TYPE.SUCCESS,'CUSTOMER-CREATE','POST','PreActiveSubscription',data,"PreActiveSubscription entry created successfully in the SMS");
          D && console.log("sucess", data);
        };
      });
      })
    });
  };
};

function duplicate(delarr, subscription_id, getBundleId, samearr, reupdatearr, base_bundle_updation, expires_on, allIptv, expiryDate, enable_reseller_bundle_creation, pack_cb) {
  var all_ids = [...samearr, ...reupdatearr, ...delarr];
  var original_del_arr = [];
  BundleResellerCustomPackage.findAll({ raw: true, where: { bundle_id: all_ids } }).then(function (bundle_reseller) {
    if (delarr.length > 0) {
      original_del_arr = bundle_reseller.map(function (out) {
        if (delarr.includes(out.bundle_id)) {
          return out.reseller_custom_bundle_id
        }
      })
    }
    if (!enable_reseller_bundle_creation) {
      getBundleId = [...getBundleId, ...samearr]
      getBundleId = [...getBundleId, ...reupdatearr]
      getBundleId = [...getBundleId, ...delarr]
    } else {
      bundle_reseller.map(function (iter) {
        getBundleId.push(iter.reseller_custom_bundle_id)
      })
      delarr = [...original_del_arr, ...delarr];
    }

    SubscriptionBundle.destroy({ where: { bundle_id: delarr, subscription_id: subscription_id } }).then(function (del) {
      SubscriptionPackage.destroy({ where: { bundle_id: delarr, subscription_id: subscription_id } }).then(function (delpack) {
        SubscriptionPackage.findAll({ raw: true, where: { subscription_id: subscription_id } }).then(function (exist_package) {
          BundlePackage.findAll({ where: { bundle_id: getBundleId }, include: [Bundle], attributes: { exclude: ['id', 'createdAt', 'updatedAt'] } }).then(function (bundlepacks) {
            var old_packages = getPackages(exist_package);
            var bundle_object = getPackages(bundlepacks);
            var subpack_new_arr = [], subpack_update_arr = [], subpack_delarr_arr = [];
            if (!allIptv) {
              if (bundlepacks.length > 0) {
                for (var i = 0; i < bundlepacks.length; i++) {
                  var new_package = bundlepacks[i];
                  var pack_id = new_package.package_id;
                  new_package.createdAt = new Date();
                  new_package.subscription_id = subscription_id;
                  if (base_bundle_updation) {
                    new_package.expiry_date = expiryDate;
                  } else {
                    new_package.expiry_date = expires_on;
                  }
                  if (old_packages[pack_id]) {
                    if (!subpack_update_arr.some(function (item) {
                      return (item.package_id === pack_id)
                    })) {
                      subpack_update_arr.push({
                        package_id: new_package.package_id,
                        provider_id: new_package.provider_id,
                        bundle_id: new_package.bundle_id,
                        expiry_date: new_package.expiry_date,
                        subscription_id: new_package.subscription_id,
                      })
                    }
                  } else {
                    if ((delarr.includes(new_package.bundle_id)) && (!subpack_update_arr.some(function (item) { return (item.package_id === pack_id) })) && (!subpack_new_arr.some(function (item) { return (item.package_id === pack_id) }))) {
                      subpack_delarr_arr.push(new_package.package_id)
                    } else {
                      var common = bundle_object[pack_id];
                      if (!subpack_new_arr.some(function (item) { return (item.package_id === pack_id) })) {
                        subpack_new_arr.push({
                          package_id: new_package.package_id,
                          provider_id: new_package.provider_id,
                          bundle_id: delarr.includes(new_package.bundle_id) ? common.bundle_id : new_package.bundle_id,
                          expiry_date: new_package.expiry_date,
                          subscription_id: new_package.subscription_id,
                        })
                      }
                    }
                  }
                  if (i + 1 == bundlepacks.length) {
                    var recheck_arr = [];
                    subpack_new_arr.map(function (op) {
                      subpack_delarr_arr.map(function (text, x) {
                        if (op.package_id == text) {
                          subpack_delarr_arr.splice(x, 1)
                        }
                      })
                    })
                    SubscriptionPackage.bulkCreate(subpack_new_arr).then(function (create_sub_pack) {
                      if (subpack_update_arr.length > 0) {
                        for (var j = 0; j < subpack_update_arr.length; j++) {
                          var pack_data = subpack_update_arr[j];
                          SubscriptionPackage.update(pack_data, { where: { package_id: pack_data.package_id, subscription_id: pack_data.subscription_id } }).then(function (update_sub_pack) {
                          })
                          if (j + 1 == subpack_update_arr.length) {
                            pack_cb(subpack_delarr_arr);
                          }
                        }
                      } else {
                        pack_cb(subpack_delarr_arr);
                      }
                    })
                  }
                }
              } else {
                pack_cb(1)
              }
            } else {
              pack_cb(1)
            }
          }, function (err) {
            pack_cb(0)
          })
        }, function (err) {
          pack_cb(0)
        })
      }, function (err) {
        pack_cb(0)
      })
    }, function (err) {
      pack_cb(0)
    })
  })
}

function sendInvoice(id, filename, callbk) {
  Transaction.findAll({ where: { transaction_id: id }, include: [Invoice] }).then(function (invoice) {
    Org.findOne({ raw: true, where: { org_id: invoice[0].org_id } }).then(function (org) {
      var file_name = filename;
      var arr = [];
      transactionPDF.create(file_name, arr, org, invoice[0], function (path) {
        // var subject = 'Invoice from Skie';
        // var attach = [{filename:file_name,path:path.filename}];
        // Mailer.sendMail(null,null,org.report_email,false,null,attach,subject);
        callbk("Subscription created successfully");
      });
    }, function (err) {
      res.status(500).send("There was a problem in adding the Subscription")
    });
  });
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

function singleCreate(body, invoiceEntry, reseller_invoiceEntry, enable_reseller_flag,cb) {
  body.subscription_bundles.map(function (data) { delete data.id })
  Subscription.create(body, { include: [{ model: SubscriptionBundle }, { model: SubscriptionPackage }] }).then(function (subs) {
    Transaction.create(invoiceEntry, { include: [Invoice] }).then(function (trans) {
      if(enable_reseller_flag){
        Transaction.create(reseller_invoiceEntry, { include: [Invoice] }).then(function (res_trans) {
          cb(200, subs.subscription_id, "Subscription Created Successfully");
        })
      }else{
        cb(200, subs.subscription_id, "Subscription Created Successfully");
      }
    });
  }, function (err) {
    if (err && err.errors[0].message) {
      return cb(500, 0, err.errors[0].message);
    };
    cb(500, 0, "Subscription creation failed");
  });
};

function multipleCreate(subscription, bulkfinal, subPackArr, invoiceEntry, reseller_invoiceEntry,enable_reseller_flag,cb) {
  Subscription.bulkCreate(subscription).then(function (subs) {
    SubscriptionBundle.bulkCreate(bulkfinal).then(function (sub_bundle) {
      SubscriptionPackage.bulkCreate(subPackArr).then(function (sub_pack) {
        Transaction.create(invoiceEntry, { include: [Invoice] }).then(function (trans) {
          if(enable_reseller_flag){
            Transaction.create(reseller_invoiceEntry, { include: [Invoice] }).then(function (res_trans) {
              cb(200, "Subscription Created Successfully");
            })
          }
          else{
            cb(200, "Subscription Created Successfully");
          }
        });
      });
    });
  }, function (err) {
    if (err && err.errors[0].message) {
      return cb(500, err.errors[0].message);
    };
    cb(500, "Subscription creation failed");
  });
};

function bundle_invoice(request, subscription_bund, invoiceEntry, getBundleId, addon_name, bundle_cb) {
  OperatorSetting.findOne({ raw: true, where: { org_id: request.org_id } }).then(function (oper) {
    Org.findOne({ raw: true, where: { reseller_org_id: oper.reseller_org_id, org_type: ['RESELLER', 'HEPI_RESELLER'] } }).then(function (reseller_oper) {
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
    var reseller_invoiceEntry = { invoices: [] }
    if (org_provider_flag) {
      reseller_invoiceEntry = {
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

function guid() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}

router.post('/', VerifyToken, function (req, res) {
  var bulkfinal = [], sms_ids = [], external_bundle_ids = [], getBundleId = [];
  Org.findOne({ raw: true, where: { org_id: req.orgId } }).then(function (org) {
    Org.findOne({ raw: true, where: { reseller_org_id: org.reseller_org_id, org_type: ['RESELLER', 'HEPI_RESELLER'] } }).then(function (orgs_reseller) {
      BundleResellerCustomPackage.findAll({ raw: true }).then(function (bundle_reseller) {
        BundleGroupedPackage.findAll({ raw: true }).then(function (grp_bundle) {
          var org_provider_type = orgs_reseller.provider_type;
          var org_provider_flag = ((org_provider_type == 'Independent') || (org_provider_type == 'Partner')) ? true : false;
     
          OperatorSetting.findOne({ raw: true, where: { org_id: req.orgId } }).then(function (oper) {
            var enable_reseller_flag=false
            if(oper.enable_reseller_bundle_creation){
              enable_reseller_flag = true
            }
            creditCalculation.Calculate({ org_id: orgs_reseller.org_id }, res_cb)
            function res_cb(argument) {
              if (argument.status == 500) { return res.status(argument.status).send(argument.msg) }
              if (argument.status == 200) {
                if (argument.msg.status == 'failed' && !oper.pre_activation_flag && oper.enable_reseller_bundle_creation) { return res.status(500).send("Insufficient Balance. Please contact your reseller") }
                var reseller_account_balance = (!isCreditEmpty(argument.msg.object)) ? Number(argument.msg.object.toFixed(2)) : 0;
                var org_address = org.city + ', ' + org.state + ', ' + org.pincode;
                var days = (renewalObj[req.body.mode]);
                var active_date = new Date().setHours(0, 0, 0, 0);
                var expiry = new Date();
                var expiryDate = new Date(expiry.setDate(expiry.getDate() + days)).setHours(23, 59, 59, 999);
                creditCalculation.Calculate({ org_id: org.org_id }, cb)
                function cb(data) {
                  if (data.status == 200) {
                    var account_balance = 0, payable_amt = 0, add_on_without_gst = 0, ott_amt = 0, ott_amt_with_gst = 0;
                    account_balance = (!isCreditEmpty(data.msg.object)) ? Number(data.msg.object.toFixed(2)) : 0;
                    var month = keyObj[req.body.mode];
                    var add_on_with_gst;
                    var reseller_cost = 0;
                    var ott_flag = false;
                    var pre_set_flag = false;
                    var pre_condition_arr = []
                    if (!req.body.bulkCreate) {
                      req.body.status = 'New';
                      req.body.org_id = org.org_id;
                      req.body.reseller_org_id = org.reseller_org_id;
                      req.body.expires_on = expiryDate;
                      req.body.is_active = 1;
                      req.body.subscription_bundles.map(function (ip) {
                        if (oper.pre_activation_flag) {
                          oper.pre_activation.map(function (precondition) {
                            if (precondition.bundle_name.bundle_name == ip.bundle_name) {
                              if (!precondition.removed_flag && precondition.free_count > 0 && precondition.used_count < precondition.free_count) {
                                if (precondition.grace_period == 0) {
                                  pre_set_flag = true;
                                  req.body.expires_on = precondition.end_date
                                  precondition.used_count += 1;
                                  if (!pre_condition_arr.some(function (val) { return val.bundle_name.bundle_name == precondition.bundle_name.bundle_name })) {
                                    pre_condition_arr.push(precondition)

                                  }
                                } else {
                                  var startDate = new Date(precondition.start_date)
                                  precondition.grace_period = Number(precondition.grace_period);
                                  var  check_date = new Date(startDate.setDate(startDate.getDate() + precondition.grace_period)).setHours(23, 59, 59, 999);
                                  if (active_date <= check_date) {
                                    var days_mode = dayObj[precondition.mode.id]
                                    pre_set_flag = true;
                                    var expiry = new Date();
                                    req.body.expires_on= new Date(expiry.setDate(expiry.getDate() + days_mode)).setHours(23, 59, 59, 999);
                                    precondition.used_count += 1;
                                    if (!pre_condition_arr.some(function (val) { return val.bundle_name.bundle_name == precondition.bundle_name.bundle_name })) {
                                      pre_condition_arr.push(precondition)
                                    }
                                  }
                                }
                              }
                            } else {
                              if (!pre_condition_arr.some(function (val) { return val.bundle_name.bundle_name == precondition.bundle_name.bundle_name })) {
                                pre_condition_arr.push(precondition)
                              }
                            }
                          })
                        }
                        if (ip.bundle_type == resellerpackage) {
                          if (!ip.bundle_name.includes('NCF')) {
                            if (org_provider_type == 'Independent' && !ip.addon) {
                              reseller_cost += ip.ott_price;
                            } else {
                              reseller_cost += ip.recommend_cost;
                            }
                          }
                          var bun_res_filter = bundle_reseller.filter(function (bund_res) {
                            return (bund_res.bundle_id == ip.bundle_id)
                          })
                          ip.org_id = org.org_id;
                          if (bun_res_filter.length > 0) {
                            bun_res_filter.map(function (item, y) {
                              getBundleId.push(item.reseller_custom_bundle_id)
                              if (y + 1 == bun_res_filter.length) {
                                add_on_without_gst += ip.seller_cost
                              }
                            })
                          }
                          if (ip.is_external_packages) {
                            external_bundle_ids.push(ip.bundle_id)
                          };
                        } else {
                          getBundleId.push(ip.bundle_id)
                          if ((ip.bundle_type == bundlepackage) || (ip.bundle_type == externalpackage) || (ip.bundle_type == custompackage) || (ip.bundle_type == groupedpackage)) {
                            add_on_without_gst = (ip.bundle_type == custompackage) ? (add_on_without_gst + ip.bundle_cost) : (add_on_without_gst + ip[month]);
                          };
                          ip.org_id = org.org_id;
                          if (ip.is_external_packages) {
                            external_bundle_ids.push(ip.bundle_id)
                          };
                        }
                      });
                      BundlePackage.findAll({ raw: true, where: { bundle_id: getBundleId }, attributes: { exclude: ['id'] } }).then(function (bundlepack) {
                        var bundlepack = bundlepack.filter(function (thing, index) {
                          delete thing.id
                          return index === bundlepack.findIndex(function (obj) {
                            return obj.package_id === thing.package_id;
                          });
                        });
                        bundlepack.map(function (bp) {
                          bp.expiry_date = expiryDate;
                        });
                        req.body.subscription_packages = bundlepack;
                        reseller_cost_with_gst = Number((reseller_cost + ((reseller_cost * 18) / 100)).toFixed(2));
                        add_on_with_gst = Number((add_on_without_gst + ((add_on_without_gst * 18) / 100)).toFixed(2));
                        if (pre_set_flag) {
                          reseller_cost_with_gst = 0;
                          add_on_with_gst = 0;
                        }
                        payable_amt = add_on_with_gst;
                        var balance_check = (oper.enable_reseller_bundle_creation) ? reseller_account_balance : account_balance;
                        if (balance_check >= reseller_cost_with_gst) {
                          if (account_balance >= payable_amt) {
                            req.body.org_id = req.orgId;
                            transaction_invoice(req.body, org, payable_amt, ott_flag, false, null, getBundleId, org_provider_flag, orgs_reseller, reseller_cost_with_gst, function (invoiceEntry, reseller_invoiceEntry, getBundleId, addon_name) {
                              req.body.activated_on = new Date().setHours(0, 0, 0, 0);
                              if (reseller_invoiceEntry.total_amount == 0 && !pre_set_flag) {
                                reseller_invoiceEntry = {}
                              }
                              invoiceEntry.mobile = req.body.mobile;
                              invoiceEntry.mac_address = req.body.mac_address;
                              invoiceEntry.serial_no = req.body.serial_no;
                              invoiceEntry.name = req.body.name;
                              reseller_invoiceEntry.mobile = req.body.mobile;
                              reseller_invoiceEntry.mac_address = req.body.mac_address;
                              reseller_invoiceEntry.serial_no = req.body.serial_no;
                              reseller_invoiceEntry.name = req.body.name;
                              singleCreate(req.body, invoiceEntry, reseller_invoiceEntry, enable_reseller_flag,function (status, id, cb_data) {
                                if (status == 200) {
                                  var emmObj = {
                                   status : 'Active',
                                   subscriber_id : id,
                                   subscriber_name : req.body.name
                                 };
                                  EMM.update(emmObj, { where: { unique_id: req.body.serial_no } }).then(function (emm) {
                                    if(pre_set_flag){
                                      OperatorSetting.update({pre_activation : pre_condition_arr},{where:{org_id:req.orgId}}).then(function(update){})
                                    }
                                  }, function (err) { })
                                  if (req.body.checkIptv) {
                                    var m2m_payload;
                                    req.body.subscription_bundles.map(function (pos) {
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
                                      } else if (pos.bundle_type == 'groupedpackage') {
                                        var grp_filter = grp_bundle.filter(function (grp_entry) {
                                          return grp_entry.bundle_id == pos.bundle_id
                                        })
                                        grp_filter.map(function (ip) {
                                          if (ip.iptv) {
                                            sms_ids.push(ip.grouped_bundle_id)
                                          }
                                        })
                                      } else {
                                        if (pos.iptv) {
                                          sms_ids.push(pos.bundle_id)
                                        };
                                      }
                                    });
                                    req.body.activation_code = generateActivationCode(req.body.email, org.short_code);
                                    req.body.user_id = req.userId;
                                    req.body.org_id = (org.org_type == 'HEPI_OPERATOR') ? orgs_reseller.org_id : req.orgId;
                                    req.body.org_name = org.org_name;
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
                                      customer: [req.body]
                                    };
                                  }
                                  var url = '/api/partner/subscription';
                                  if (external_bundle_ids.length > 0) {
                                    external_apps_call('single', req.body, external_bundle_ids, expiryDate, function (argument) {
                                      sms_call(m2m_payload, url, sms_ids, req.userId, 'create', pre_set_flag);
                                      res.status(status).send(cb_data);
                                    })
                                  } else {
                                    sms_call(m2m_payload, url, sms_ids, req.userId, 'create', pre_set_flag);
                                    res.status(status).send(cb_data);
                                  }
                                } else {
                                  res.status(status).send(cb_data);
                                };
                              });
                            });
                          } else {
                            adjust_pay();
                          };
                        } else {
                            if(oper.enable_reseller_bundle_creation){
                              res.status(500).send("Insufficient Balance. Please contact your reseller");
                            }
                            else{
                              adjust_pay();
                            }
                        }
                      });
                    }
                    else if (req.body.bulkCreate) {
                      Subscription.findAll({ raw: true }).then(function (checkSubs) {
                        var dupeArr = [];
                        req.body.arr.map(function (input) {
                          if (checkSubs.some(function (item) { return ((item.email == input.email) || (item.mobile == input.mobile)) })) {
                            dupeArr.push(input)
                          }
                        });
                        if (dupeArr.length > 0) {
                          res.status(500).send({ dupe: dupeArr });
                        } else {
                          var subscription = req.body.arr;
                          var bundles = req.body.subscription_bundles;
                          var sub_id = [];
                          var bulk_mobile = [];
                          var bulk_name = [];
                          var bulk_mac_address = [];
                          var bulk_serial_no = [];
                          for (var i = 0; i < subscription.length; i++) {
                            var sub_index = subscription[i];
                            bulk_mobile.push(sub_index.mobile);
                            bulk_name.push(sub_index.name);
                            bulk_mac_address.push(sub_index.mac_address);
                            bulk_serial_no.push(sub_index.serial_no)
                            sub_index.mobile = sub_index.mobile.replace('\r', '');
                            sub_id.push(sub_index.subscription_id);
                            sub_index.status = 'New';
                            sub_index.checkIptv = req.body.checkIptv
                            sub_index.org_id = org.org_id;
                            sub_index.reseller_org_id = org.reseller_org_id;
                            sub_index.expires_on = expiryDate;
                            sub_index.is_active = 1;
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
                                if (!bundle_index.bundle_name.includes('NCF')) {
                                  if ((org_provider_type == 'Independent') && (!bundle_index.addon)) {
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
                                    getBundleId.push(item.reseller_custom_bundle_id)
                                  })
                                }
                              } else {
                                if ((bundle_index.bundle_type == bundlepackage) || (bundle_index.bundle_type == externalpackage) || (bundle_index.bundle_type == custompackage) || (bundle_index.bundle_type == groupedpackage)) {
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
                            var balance_check = (oper.enable_reseller_bundle_creation) ? reseller_account_balance : account_balance;
                            if (balance_check >= reseller_cost_with_gst) {
                              if (account_balance >= payable_amt) {
                                req.body.org_id = req.orgId;
                                transaction_invoice(req.body, org, payable_amt, ott_flag, false, null, getBundleId, org_provider_flag, orgs_reseller, reseller_cost_with_gst, function (invoiceEntry, reseller_invoiceEntry, getBundleId, addon_name) {
                                  req.body.arr.map(function (emm_bulk) {
                                    var emm_obj = {
                                      status : 'Active',
                                      subscriber_id : emm_bulk.subscription_id,
                                      subscriber_name : emm_bulk.name
                                    } 
                                    EMM.update(emm_obj, { where: { unique_id: emm_bulk.serial_no } }).then(function (emm_updated) { });
                                  })
                                  if (reseller_invoiceEntry.total_amount == 0) {
                                    reseller_invoiceEntry = {}
                                  }
                                  invoiceEntry.mobile = bulk_mobile.toString();
                                  reseller_invoiceEntry.mobile = bulk_mobile.toString();
                                  invoiceEntry.name = bulk_name.toString();
                                  reseller_invoiceEntry.name = bulk_name.toString();
                                  if (bulk_mac_address[0] != undefined && bulk_serial_no[0] != undefined) {
                                    invoiceEntry.mac_address = bulk_mac_address.toString();
                                    invoiceEntry.serial_no = bulk_serial_no.toString();
                                    reseller_invoiceEntry.mac_address = bulk_mac_address.toString();
                                    reseller_invoiceEntry.serial_no = bulk_serial_no.toString();
                                  }
                                  multipleCreate(subscription, bulkfinal, subPackArr, invoiceEntry, reseller_invoiceEntry,enable_reseller_flag,function (status, cb_data) {
                                    if (status == 200) {
                                      if (req.body.checkIptv) {
                                        var m2m_payload;
                                        req.body.subscription_bundles.map(function (pos) {
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
                                          } else if (pos.bundle_type == 'groupedpackage') {
                                            var grp_filter = grp_bundle.filter(function (grp_entry) {
                                              return grp_entry.bundle_id == pos.bundle_id
                                            })
                                            grp_filter.map(function (ip) {
                                              if (ip.iptv) {
                                                sms_ids.push(ip.grouped_bundle_id)
                                              }
                                            })
                                          } else {
                                            if (pos.iptv) {
                                              sms_ids.push(pos.bundle_id)
                                            };
                                          }
                                        });
                                        req.body.arr.map(function (like) {
                                          like.activation_code = JSON.stringify(generateActivationCode(like.email, org.short_code));
                                          like.user_id = req.userId;
                                          like.org_id = (org.org_type == 'HEPI_OPERATOR') ? orgs_reseller.org_id : req.orgId;
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
                                        Subscription.findAll({ where: { subscription_id: sub_id }, include: [SubscriptionBundle] }).then(function (sub_datas) {
                                          external_apps_call('multiple', sub_datas, external_bundle_ids, expiryDate, function (argument) {
                                            sms_call(m2m_payload, url, sms_ids, req.userId, 'create', pre_set_flag)
                                            res.status(status).send(cb_data);
                                          })
                                        })
                                      } else {
                                        sms_call(m2m_payload, url, sms_ids, req.userId, 'create', pre_set_flag)
                                        res.status(status).send(cb_data);
                                      }
                                    } else {
                                      res.status(status).send(cb_data);
                                    };
                                  });
                                });
                              } else {
                                adjust_pay();
                              };
                            } else {
                                if(oper.enable_reseller_bundle_creation){
                                  res.status(500).send("Insufficient Balance. Please contact your reseller");
                                }
                                else{
                                  adjust_pay();
                                }
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
                      res.status(200).send({
                        msg: msg,
                        btn: "Make Rs." + finalAmt + " payment to complete",
                        account_balance: account_balance,
                        adjusted_amount: finalAmt,
                        reseller_cost: reseller_cost_with_gst
                      });
                    };
                  };
                };
              }
            }
          })
        });
      })
    })
  })
});

router.put('/emm_swap', VerifyToken, function (req, res) {
  var m2m_payload;
  var sms_ids = [], bundleId = [], sub = {};
  var pre_set_flag = false;
  Org.findOne({ raw: true, where: { org_id: req.orgId } }).then(function (org) {
    Subscription.findOne({ where: { subscription_id: req.body.subscription_id }, include: [SubscriptionBundle] }).then(function (sub_detail) {
      sub_detail.subscription_bundles.map(function (sub_bundle) {
        bundleId.push(sub_bundle.bundle_id)
      })
      Bundle.findAll({ where: { bundle_id: bundleId }, include: [{ model: BundlePackage }, { model: BundleExternalPackage }, { model: BundleCustomExternalPackage }, { model: BundleResellerCustomPackage }, { model: BundleGroupedPackage }] }).then(function (below_bundle) {
        below_bundle.map(function (pos) {
          if (pos.bundle_type == 'resellerpackage') {
            var res_pack = pos.bundle_reseller_custom_packages
            res_pack.map(function (res_data) {
              if (res_data.iptv) {
                sms_ids.push(res_data.reseller_custom_bundle_id)
              } else {
                if (pos.bundle_type == 'groupedpackage') {
                  var grp_filter = pos.bundle_grouped_packages.filter(function (grp_entry) {
                    return grp_entry.bundle_id == res_data.reseller_custom_bundle_id
                  })
                  grp_filter.map(function (ip) {
                    if (ip.iptv) {
                      sms_ids.push(ip.grouped_bundle_id)
                    }
                  })
                }
              }
            })
          }else if(pos.bundle_type == 'groupedpackage'){
            var grp_filter = pos.bundle_grouped_packages.filter(function (grp_entry) {
              return grp_entry.bundle_id == pos.bundle_id
            });
            grp_filter.map(function (ip) {
              if (ip.iptv) {
                sms_ids.push(ip.grouped_bundle_id);
              };
            });
          }else {
            if (pos.iptv) {
              sms_ids.push(pos.bundle_id)
            };
          };
        });
        var org_address = org.city + ', ' + org.state + ', ' + org.pincode;
        var active_date = new Date().setHours(0, 0, 0, 0);
        var m2m_payload = {
          customer_id: sub_detail.subscription_id,
          activation_code: generateActivationCode(sub_detail.email, org.short_code),
          user_id: req.userId,
          org_id: req.orgId,
          org_name: org.org_name,
          customer_firstname: sub_detail.name,
          billing_address: org_address,
          billing_city: org.city,
          billing_pincode: org.pincode,
          installation_address: org_address,
          installation_city: org.city,
          installation_pincode: org.pincode,
          installation_state: org.state,
          billing_state: org.state,
          unique_id: req.body.serial_no,
          account_lock: 'Disable',
          username: sub_detail.name,
          email: sub_detail.email,
          phone_number: sub_detail.mobile,
          start_date: active_date,
          end_date: sub_detail.expires_on,
          mac_address: req.body.mac_address,
          base_bundle_updation: true,
          swap_flag: true,
          existing_serial_no: req.body.existing_serial_no
        }
        var url = '/api/partner/edit'
        EMM.update({ status: 'Inactive' }, { where: { unique_id: req.body.existing_serial_no } }).then(function (emm) {
          var new_subscription_id = guid()
          Subscription.update({ serial_no: req.body.serial_no, mac_address: req.body.mac_address, subscription_id: new_subscription_id }, { where: { subscription_id: req.body.subscription_id } }).then(function (sub_update) {
            if (sub_update) {
              EMM.update({ status: 'Active', subscription_id: new_subscription_id }, { where: { unique_id: req.body.serial_no } }).then(function (emm_update) {
                SubscriptionPackage.update({ subscription_id: new_subscription_id }, { where: { subscription_id: req.body.subscription_id } }).then(function (subpackage_update) {
                  SubscriptionBundle.update({ subscription_id: new_subscription_id }, { where: { subscription_id: req.body.subscription_id } }).then(function (subbundle_update) {
                    AccessLogin.update({ subscription_id: new_subscription_id }, { where: { subscription_id: req.body.subscription_id } }).then(function (acclog_update) {
                      SubscriberExternalApp.update({ subscriber_id: new_subscription_id }, { where: { subscriber_id: req.body.subscription_id } }).then(function (subexternal_update) {
                        if (sub_detail.checkIptv) {
                          m2m_payload['new_subscription_id'] = new_subscription_id;
                          sms_call(m2m_payload, url, sms_ids, req.userId, 'create', pre_set_flag);
                          res.status(200).send("Inventory update successfully")
                        } else {
                          res.status(200).send("Inventory update successfully")
                        }
                      })
                    })
                  })
                })
              })
            }
          }, function (err) {
            res.status(500).send("There was a problem in updating the inventory")
          })
        })
      })
    })
  })
})

router.get('/:status/:limit/:offset', VerifyToken, function (req, res) {
  Org.findOne({ raw: true, where: { org_id: req.orgId } }).then(function (org) {
    Org.findOne({ raw: true, where: { reseller_org_id: org.reseller_org_id, org_type: ['RESELLER', 'HEPI_RESELLER'] } }).then(function (reseller_org) {
      if (req.role == 'ADMIN' || req.role == 'SUPPORT') {
        var obj = {}
      } else if (req.role == 'RESELLER' || req.role == 'HEPI_RESELLER') {
        var obj = { reseller_org_id: reseller_org.reseller_org_id }
      } else {
        var obj = { org_id: req.orgId }
        if ((req.params.status == 'Deactive') || (req.params.status == 'Active') || (req.params.status.toLowerCase() == 'inactive')) {
          obj = { org_id: req.orgId, status: req.params.status }
        } else if (req.params.status == 'Expires Today') {
          obj = {
            org_id: req.orgId,
            expires_on: new Date(new Date()).setHours(23, 59, 59, 999)
          }
        } else if (req.params.status.toLowerCase() == 'new') {
          obj = {
            org_id: req.orgId,
            status: ['New', 'Active']
          };
        };
      };
      var limit = req.params.limit;
      var off = (req.params.offset == 0) ? 0 : (req.params.offset - 1) * limit
      Subscription.findAndCountAll({ where: obj, limit: Number(limit), offset: Number(off), include: [{ model: AccessLogin }, { model: SubscriptionBundle }, { model: Org, as: 'subscriberOrg' }], order: [['createdAt', 'DESC']] }).then(function (all_type_info) {
        if (all_type_info.rows.length > 0) {
          getTotalPages(all_type_info, limit, function (obj) {
            res.status(200).send(obj)
          });
        } else {
          res.status(200).send({ count: 0, rows: [] })
        };
      }, function (err) {
        res.status(500).send("Problem in finding Subscription");
      });
    });
  });
});

router.get('/', VerifyToken, function (req, res) {
  EMM.findAll({ raw: true, where: { org_id: req.orgId, status: ['Fresh', 'Deactive', 'Inactive'] } }).then(function (emm) {
    return res.status(200).send(emm);
  }, function (err) {
    return res.status(500).send("There was a problem to find the EMM details");
  });
});

router.post('/manualRenewal', VerifyToken, function (req, res) {
  Bundle.findAll({ raw: true }).then(function (bundle) {
    totalBundle = bundle;
    Org.findOne({ raw: true, where: { org_id: req.orgId } }).then(function (org) {
      Org.findOne({ raw: true, where: { reseller_org_id: org.reseller_org_id, org_type: ['RESELLER', 'HEPI_RESELLER'] } }).then(function (reseller_org) {
	OperatorSetting.findOne({ raw: true, where: { org_id: reseller_org.org_id } }).then(function (res_oper) {
        BundlePackage.findAll({ raw: true }).then(function (bundlepack) {
          totalBundlePack = bundlepack;
          SubscriptionPackage.findAll({ raw: true }).then(function (subscription_package) {
            totalSubscriptionPack = subscription_package;
            creditCalculation.Calculate({ org_id: reseller_org.org_id }, res_cb)
            function res_cb(argument) {
	            if (argument.msg.status == 'failed' && !res_oper.pre_activation_flag && res_oper.enable_reseller_bundle_creation) { return res.status(500).send("Insufficient balance in the reseller account!") }
              if ((argument.status == 200)) {
            		var reseller_account_balance = (!isCreditEmpty(argument.msg.object)) ? Number(argument.msg.object.toFixed(2)) : 0;
                OperatorSetting.findOne({ raw: true, where: { org_id: req.orgId } }).then(function (oper) {
                  creditCalculation.Calculate({ org_id: oper.org_id }, cb)
                  function cb(data) {
                    if (argument.msg.status == 'failed') { return res.status(500).send("Insufficient Balance. Please add your credits") }
                    if ((data.status == 200) && (data.msg.status == 'success')) {
                      var availables = data.msg.object.toFixed(2);
                      Subscription.findAll({
                        where: { subscription_id: req.body.id_array },
                        include: [{
                          model: SubscriptionBundle,
                          attributes: { exclude: ['id'] }
                        }]
                      }).then(function (subscription) {
                        makeManualRenewal(subscription, availables, totalBundle, oper.ncf_bundle_id, oper, totalBundlePack, totalSubscriptionPack, reseller_org, reseller_account_balance);
                      })
                    } else {
                      res.status(500).send("No credits available for this operator")
                    }
                  }
                }, function (err) {
                  D && console.log("Problem in finding operator_setting")
                })
              }else{
		res.status(500).send("No credits available in the reseller account!")
	      }
            }
          })
	  })
        })
      })
    })
  })

  function makeManualRenewal(subscription, availables, totalBundle, ncf_bundle_id, oper, totalBundlePack, totalSubscriptionPack, reseller_org_filter, reseller_account_balance) {
    BundleResellerCustomPackage.findAll({ raw: true }).then(function (bundle_reseller) {
      BundleGroupedPackage.findAll({ raw: true }).then(function (grp_bundle) {
        Provider.findAll({ raw: true, where: { iptv: true } }).then(function (providers) {
          ProviderPackage.findAll({ raw: true }).then(function (package_data) {
            ProviderPackageContent.findAll({ raw: true, where: { is_deleted: 0 }, attributes: ['package_id', 'is_deleted'] }).then(function (channel_pack) {
              var channel_check_arr = [];
              var channel_map = {};
              channel_pack.map(function (data) {
                channel_map[data.package_id] = data.is_deleted
              });
              var org_provider_type = reseller_org_filter.provider_type;
              var org_provider_flag = ((org_provider_type == 'Independent') || (org_provider_type == 'Partner')) ? true : false;
              if (subscription.length > 0) {
                var renewalArrId = [], renewalArr = [], external_bundle_ids = [];
                var amt_with_gst = 0, final_amt = 0, final_reseller_amt = 0, reseller_cost = 0, reseller_cost_with_gst = 0;
                var bundle_cost;
                var sub_mobile = [], sub_serial_no = [], sub_mac = [], sub_name = [];
                var db_bundle_ids = totalBundle.map(function (data) { return data.bundle_id });
                for (var i = 0; i < subscription.length; i++) {
                  (function (sub, index) {
                    var new_sub_bundle = []
                    var amt = 0, ott_amt = 0, ncf_cost = 0;
                    var month = keyObj[sub.mode];
                    var ncfBundle;
                    var iptvFlag = false;
                    sub_name.push(sub.name)
                    sub_mobile.push(sub.mobile)
                    sub_mac.push(sub.mac_address)
                    sub_serial_no.push(sub.serial_no)
                    //Bundle Check Status....
                    var renewal_bundle = [];
                    sub.subscription_bundles.map(function (data) {
                      if (db_bundle_ids.includes(data.bundle_id)) {
                        renewal_bundle.push(data)
                      }
                    })
                    var packArr = [];
                    renewal_bundle.map(function (argument, count) {
                      if (((argument.iptv == 'true') || (argument.iptv == true)) && ((argument.addon_status == 'true') || (argument.addon_status == true))) {
                        iptvFlag = true
                      }
                      var check_bundle = totalBundle.filter(function (prop_bundles) {
                        return (prop_bundles.bundle_id == argument.bundle_id)
                      })
                      if ((check_bundle.length > 0) && check_bundle[0].is_external_packages) {
                        external_bundle_ids.push(argument.bundle_id)
                      }
                      var days = (renewalObj[sub.mode])
                      var expiry = new Date();
                      var start_date = (new Date(expiry)).getTime();//next date of current sale expire date
                      var updated_start_date = new Date(start_date).setHours(0, 0, 0, 0);
                      var new_updated_date = new Date(updated_start_date)
                      var updated_end_date = new Date(new_updated_date.setDate(new_updated_date.getDate() + days)).setHours(23, 59, 59, 999);
                      var bundlefilter = totalBundle.filter(function (prop) {
                        return (prop.bundle_id == argument.bundle_id)
                      })
                      if (!argument.bundle_name.includes('NCF')) {
                        var packfilter = totalSubscriptionPack.filter(function (prop) {
                          return ((prop.bundle_id == argument.bundle_id) && ((prop.subscription_id == argument.subscription_id)))
                        })
                      }
                      var bun_res_filter = bundle_reseller.filter(function (bund_res) {
                        return (bund_res.bundle_id == argument.bundle_id)
                      })
                      if (org_provider_flag) {
                        if (bun_res_filter.length > 0) {
                          bun_res_filter.map(function (out) {
                            totalSubscriptionPack.map(function (prop) {
                              if ((prop.bundle_id == out.reseller_custom_bundle_id) && ((prop.subscription_id == argument.subscription_id))) {
                                packfilter.push(prop)
                              }
                            })
                          })
                          if ((!argument.base) && ((argument.addon_status == 'true') || (argument.addon_status == true)) && (argument.bundle_id == ncf_bundle_id) && iptvFlag) {
                            ncf_cost = bundle_cost;
                            ncfBundle = argument;
                          }
                          packfilter.map(function (prop) {
                            prop.expiry_date = updated_end_date;
                          })
                          packArr = [...packArr, ...packfilter];
                          if (!argument.bundle_name.includes('NCF')) {
                            if ((org_provider_type == 'Independent') && (!bundlefilter[0].addon)) {
                              reseller_cost += bundlefilter[0].ott_price;
                            } else {
                              reseller_cost += bundlefilter[0].recommend_cost;
                            }
                          }
                          bundle_cost = bundlefilter[0].seller_cost
                          argument['bundle_reseller_custom_packages'] = bun_res_filter;
                          if (argument.base) {
                            amt = amt + bundle_cost;
                            new_sub_bundle.push(argument);
                          }
                          if (argument.addon == true && argument.iptv == true && !argument.bundle_name.includes('NCF')) {
                            amt = amt + bundle_cost;
                            new_sub_bundle.push(argument);
                          }
                        } else {
                          if ((!argument.base) && ((argument.addon_status == 'true') || (argument.addon_status == true)) && (argument.bundle_id == ncf_bundle_id) && iptvFlag) {
                            ncf_cost = bundle_cost;
                            ncfBundle = argument;
                          }
                        }
                      }
                      if (packfilter && packfilter.length > 0) {
                        if ((!argument.base) && ((argument.addon_status == 'true') || (argument.addon_status == true)) && (argument.bundle_id == ncf_bundle_id) && iptvFlag) {
                          ncf_cost = bundle_cost;
                          ncfBundle = argument;
                        }
                        packfilter.map(function (prop) {
                          prop.expiry_date = updated_end_date;
                        })
                        packArr = [...packArr, ...packfilter];
                        if (bundlefilter[0].bundle_type == 'custompackage') {
                          bundle_cost = bundlefilter[0].bundle_cost;
                        } else {
                          bundle_cost = bundlefilter[0][month];
                        }
                        // if (!argument.iptv && sub.stb && sub.app) {
                        //   ott_amt = ott_amt + bundle_cost;
                        // }
                        if ((argument.base) || (argument.addon == true && argument.iptv == true && !argument.bundle_name.includes('NCF'))) {
                          amt = amt + bundle_cost;
                          new_sub_bundle.push(argument);
                        }
                      }
                      if (count + 1 == renewal_bundle.length) {
                        if (iptvFlag) {
                          var ncf = totalBundle.filter(function (prop) {
                            return (prop.bundle_id == ncf_bundle_id)
                          })
                          amt = amt + ncf[0][month];
                          new_sub_bundle.push(ncf[0]);
                        }
                        amt_with_gst = Number((((amt * 18) / 100) + amt).toFixed(2));
                        reseller_cost_with_gst = Number((reseller_cost + ((reseller_cost * 18) / 100)).toFixed(2));
                        final_amt = (final_amt + amt_with_gst);
                        final_reseller_amt = final_reseller_amt + reseller_cost_with_gst;
                        sub.activated_on = updated_start_date;
                        sub.expires_on = updated_end_date;
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
                          status: 'Active',
                          serial_no: sub.serial_no,
                          autorenewal: sub.autorenewal,
                          amount: sub.amount,
                          is_new: sub.is_new,
                          checkIptv: sub.checkIptv,
                          stb_type: sub.stb_type,
                          mac_address: sub.mac_address,
                          stb: sub.stb,
                          app: sub.app,
                          subscription_package: packArr,
                          subscription_bundles: new_sub_bundle
                        }
                        renewalArr.push(sub_data);
                        renewalArrId.push(sub.subscription_id);
                      }
                    })
                  })(subscription[i]);
                }
                var invoiceEntry = {
                  org_id: oper.org_id,
                  org_name: oper.org_name,
                  reseller_org_id: oper.reseller_org_id,
                  type: 'Debit',
                  status: 'Approved',
                  payment_method: 'Offline',
                  criteria: 'Direct',
                  total_amount: final_amt,
                  invoices: []
                }
                var reseller_invoiceEntry = {}
                if (oper.enable_reseller_bundle_creation && reseller_cost_with_gst > 0) {
                  reseller_invoiceEntry = {
                    org_id: reseller_org_filter.org_id,
                    org_name: reseller_org_filter.org_name,
                    reseller_org_id: reseller_org_filter.reseller_org_id,
                    type: 'Debit',
                    status: 'Approved',
                    payment_method: 'Offline',
                    criteria: 'Direct',
                    total_amount: reseller_cost_with_gst,
                    invoices: []
                  }
                }

                var obj = {}, name = '', app_obj = {};
                var saleArr = [], id_list = [];
                renewalArr.map(function (item) {
                  var salepackages = [];
                  var month = item.mode;
                  item.subscription_bundles.map(function (prop) {
                    var ott_bundle = totalBundle.filter(function (arg) {
                      return (prop.bundle_id == arg.bundle_id)
                    })
                    var is_app = item.app ? true : false;
                    if (prop) {
                      if (obj[prop.bundle_id] == undefined) {
                        name = (name == '') ? prop.bundle_name : name + ', ' + prop.bundle_name;
                        obj[prop.bundle_id] = {};
                        obj[prop.bundle_id][month] = 1;
                        app_obj[prop.bundle_id] = {};
                        app_obj[prop.bundle_id][month] = (is_app && !ott_bundle[0].iptv) ? 1 : 0;
                      } else {
                        if (obj[prop.bundle_id][month] == undefined) {
                          obj[prop.bundle_id][month] = 1;
                          app_obj[prop.bundle_id][month] = (is_app && !ott_bundle[0].iptv) ? 1 : 0;
                        } else {
                          obj[prop.bundle_id][month] = obj[prop.bundle_id][month] + 1;
                          app_obj[prop.bundle_id][month] = app_obj[prop.bundle_id][month] + 1;
                        }
                      }
                    }
                    if (prop.bundle_reseller_custom_packages && prop.bundle_reseller_custom_packages.length > 0) {
                      if (prop && !prop.bundle_name.includes('NCF')) {
                        prop.bundle_reseller_custom_packages.map(function (output) {
                          if (output.iptv) {
                            id_list.push(output.reseller_custom_bundle_id)
                          } else {
                            grp_bundle.filter(function (grp_data) {
                              if (grp_data.bundle_id == output.reseller_custom_bundle_id) {
                                if (grp_data.iptv) {
                                  id_list.push(grp_data.grouped_bundle_id)
                                }
                              }
                            })
                          }
                        })
                        var packages = totalBundlePack.filter(function (entry) {
                          delete entry.id;
                          delete entry.createdAt
                          delete entry.updatedAt
                          entry.status = 'COMPLETED';
                          if (entry.package_name.includes('-')) {
                            var iptv_package_name = entry.package_name.split('-');
                            entry.package_name = iptv_package_name[1];
                          }
                          entry.start_date = item.activated_on
                          return id_list.includes(entry.bundle_id);
                        })
                        packages.map(function (val) {
                          var amount = package_data.filter(function (package_info) {
                            return package_info.package_id === val.package_id
                          })
                          val.charge = amount[0].amount
                          val.payable = amount[0].amount
                          val.charge_gst = Number((((val.charge * 18) / 100)).toFixed(2));
                          val.payable_gst = Number((((val.payable * 18) / 100)).toFixed(2));
                        })
                        salepackages = [...salepackages, ...packages]
                      }
                    } else {
                      if (prop && !prop.bundle_name.includes('NCF') && prop.iptv) {
                        var packages = totalBundlePack.filter(function (entry) {
                          delete entry.id;
                          delete entry.createdAt
                          delete entry.updatedAt
                          entry.status = 'COMPLETED';
                          entry.start_date = item.activated_on;
                          if (entry.package_name.includes('-')) {
                            var iptv_package_name = entry.package_name.split('-');
                            entry.package_name = iptv_package_name[1];
                          }
                          return (entry.bundle_id == prop.bundle_id);
                        })
                        packages.map(function (val) {
                          var amount = package_data.filter(function (package_info) {
                            return package_info.package_id === val.package_id
                          })
                          val.charge = amount[0].amount
                          val.payable = amount[0].amount
                          val.charge_gst = Number((((val.charge * 18) / 100)).toFixed(2));
                          val.payable_gst = Number((((val.payable * 18) / 100)).toFixed(2));
                        })
                        salepackages = [...salepackages, ...packages]
                      }
                    }
                  })
                  let uniqueObjArray = [
                    ...new Map(salepackages.map((item) => [item["package_id"], item])).values(),
                  ];
                  uniqueObjArray.map(function (unique) {
                    if (channel_map.hasOwnProperty(unique.package_id)) {
                      channel_check_arr.push(unique);
                    };
                  });
                  if (item.checkIptv) {
                    var serialsplit = item.serial_no.split("-")
                    var serial_num = serialsplit[0].trim()
                    if (channel_check_arr.length > 0) {
                      saleArr.push({
                        customer_id: item.subscription_id,
                        activation_code: serial_num,
                        org_name: oper.org_name,
                        customer_email: item.email,
                        customer_firstname: item.name,
                        start_date: item.activated_on,
                        end_date: item.expires_on,
                        is_active: 0,
                        status: 'ACTIVE',
                        user_id: req.userId,
                        customer_id: item.subscription_id,
                        is_auto_renew: item.autorenewal,
                        unique_id: item.serial_no,
                        salespackages: uniqueObjArray
                      })
                    }
                  }
                })
                for (var i in app_obj) {
                  var filter = totalBundle.filter(function (prop) {
                    return (prop.bundle_id == i);
                  })
                  var object = app_obj[i];
                  for (var j in object) {
                    var data = keyObj[j];
                    if (filter[0].bundle_type == 'custompackage') {
                      bundle_cost = filter[0].bundle_cost;
                    } else {
                      bundle_cost = filter[0][data];
                    }
                  }
                }

                Transaction.findOne({ raw: true, where: { invoice_year: new Date().getFullYear() }, order: [['trans_id', 'DESC']], limit: 1 }).then(function (trans) {
                  if (trans) {
                    invoiceEntry.bundle = name;
                    if (trans.invoice_year == new Date().getFullYear()) {
                      invoiceEntry.invoice_acc_id = trans.invoice_acc_id + 1
                      invoiceEntry.invoice_year = new Date().getFullYear()
                      invoiceEntry.invoice_id = 'INV-' + invoiceEntry.invoice_year + 'AC' + invoiceEntry.invoice_acc_id
                    } else {
                      invoiceEntry.invoice_acc_id = 1
                      invoiceEntry.invoice_year = new Date().getFullYear()
                      invoiceEntry.invoice_id = 'INV-' + invoiceEntry.invoice_year + 'AC' + invoiceEntry.invoice_acc_id
                    }
                  } else {
                    invoiceEntry.invoice_acc_id = 1
                    invoiceEntry.invoice_year = new Date().getFullYear()
                    invoiceEntry.invoice_id = 'INV-' + invoiceEntry.invoice_year + 'AC' + invoiceEntry.invoice_acc_id
                  }
                  if (oper.enable_reseller_bundle_creation) {
                    reseller_invoiceEntry.bundle = name;
                    if (trans) {
                      if (trans.invoice_year == new Date().getFullYear()) {
                        reseller_invoiceEntry.invoice_acc_id = trans.invoice_acc_id + 2
                        reseller_invoiceEntry.invoice_year = new Date().getFullYear()
                        reseller_invoiceEntry.invoice_id = 'INV-' + reseller_invoiceEntry.invoice_year + 'AC' + reseller_invoiceEntry.invoice_acc_id
                      } else {
                        reseller_invoiceEntry.invoice_acc_id = 1
                        reseller_invoiceEntry.invoice_year = new Date().getFullYear()
                        reseller_invoiceEntry.invoice_id = 'INV-' + reseller_invoiceEntry.invoice_year + 'AC' + reseller_invoiceEntry.invoice_acc_id
                      }
                    } else {
                      reseller_invoiceEntry.invoice_acc_id = 1
                      reseller_invoiceEntry.invoice_year = new Date().getFullYear()
                      reseller_invoiceEntry.invoice_id = 'INV-' + reseller_invoiceEntry.invoice_year + 'AC' + reseller_invoiceEntry.invoice_acc_id
                    }
                  }
                })
                invoiceEntry.name = sub_name.toString();
                invoiceEntry.mobile = sub_mobile.toString();
                reseller_invoiceEntry.name = sub_name.toString();
                reseller_invoiceEntry.mobile = sub_mobile.toString();
                if (sub_mac[0] != undefined && sub_serial_no[0] != undefined) {
                  invoiceEntry.mac_address = sub_mac.toString();
                  invoiceEntry.serial_no = sub_serial_no.toString();
                  reseller_invoiceEntry.mac_address = sub_mac.toString();
                  reseller_invoiceEntry.serial_no = sub_serial_no.toString();
                }
                if (reseller_account_balance >= reseller_cost_with_gst) {
                  if (availables >= final_amt) {
                    invoiceEntry.bundle = name;
                    invoiceEntry.invoices.push({
                      bund_name: invoiceEntry.bundle,
                      mode: 'multiple_mode',
                      status: 'Adjustment',
                      amt: final_amt
                    })
                    function sms_call() {
                      if (saleArr.length > 0 && saleArr[0].salespackages.length > 0) {
                        var provider_data = providers.filter(function (entry) {
                          return (entry.provider_id == saleArr[0].salespackages[0].provider_id);
                        })
                        var provider = provider_data[0];
                        var sms_payload = {
                          saleArr: saleArr
                        }
                        var obj = HTTPCli.M2MReq(provider.sms_host, provider.sms_port, 'POST', sms_payload, '/api/partner/renewal', provider.sms_token);
                        HTTPCli.https_to_SMS(obj, sucess_cb, error_cb);
                        function error_cb(err) {
                          sms_payload['sms_host'] = provider.sms_host;
                          sms_payload['sms_port'] = provider.sms_port;
                          sms_payload['sms_token'] = provider.sms_token;
                          sms_payload['api'] = '/api/partner/renewal';
                          var retry_key = 'payload' + random_number(options);
                          sms_payload['retry_key'] = retry_key;
                          sms_retry.set(retry_key, sms_payload);
                          sms_retry.save();
                        }
                        function sucess_cb(data) {
                          D && console.log("sucess", data);
                        }
                      }
                    }
                    if (reseller_invoiceEntry.total_amount == 0) {
                      reseller_invoiceEntry = {}
                    }
                    Transaction.create(invoiceEntry, { include: [Invoice] }).then(function (trans) {
                      if (oper.enable_reseller_bundle_creation) {
                        Transaction.create(reseller_invoiceEntry, { include: [Invoice] }).then(function (reseller_trans) { })
                      }

                      function sub_pack_update(renewalSubPack) {
                        if (renewalSubPack.subscription_package.length > 0) {
                          for (var i = 0; i < renewalSubPack.subscription_package.length; i++) {
                            var packData = renewalSubPack.subscription_package[i];
                            SubscriptionPackage.update(packData, { where: { subscription_id: renewalSubPack.subscription_id, package_id: packData.package_id } }).then(function (subscription_pack) {
                            })
                          }
                        }
                      }
                      if (renewalArr.length > 0) {
                        for (var i = 0; i < renewalArr.length; i++) {
                          (function (data_obj, count) {
                            sub_pack_update(data_obj);
                            data_obj.is_active = true
                            Subscription.update(data_obj, { where: { subscription_id: data_obj.subscription_id } }).then(function (subscription) {
                              if (count + 1 == renewalArr.length) {
                                if (external_bundle_ids.length > 0) {
                                  external_apps_call('renewal', renewalArr, external_bundle_ids, renewalArr[0].expires_on, function (argument) {
                                    sms_call();
                                    res.status(200).send("Subscription Renewed Successfully");
                                  })
                                } else {
                                  sms_call();
                                  res.status(200).send("Subscription Renewed Successfully");
                                }
                              }
                            })
                          })(renewalArr[i], i);
                        }
                      }
                      //})
                    })
                  } else {
                    BillSetting.findOne({ raw: true }).then(function (payment_details) {
                      Org.findOne({ raw: true, where: { org_id: req.orgId } }).then(function (org) {
                        Org.findOne({ raw: true, where: { reseller_org_id: org.reseller_org_id, org_type: ['RESELLER', 'HEPI_RESELLER'] } }).then(function (org_reseller) {
                          OperatorSetting.findOne({ raw: true, where: { org_id: org_reseller.org_id } }).then(function (oper_reseller) {
                            OperatorSetting.findOne({ raw: true, where: { org_id: org.org_id } }).then(function (oper) {
                              invoiceEntry.invoices.push({
                                bund_name: name,
                                mode: 'multiple_mode',
                                status: 'Adjustment',
                                amt: availables
                              })
                              var amt_to_pay = Number((final_amt - availables).toFixed(2));
                              var callback_url = req.body.redirection_url + "?is_manual_renewal=true/#/admin/subscription";
                              const payload = {
                                amount: Number((final_amt * 100).toFixed(2)),
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
                              if (oper.enable_reseller_bundle_creation) {
                                var payment = {
                                  payment_fields: oper_reseller.payment_fields,
                                  api_get_payment_link: oper_reseller.api_get_payment_link,
                                  api_payment_link_status: oper_reseller.api_payment_link_status,
                                  custom_fields: oper_reseller.custom_fields,
                                  request_type: oper_reseller.request_type
                                }
                              } else {
                                var payment = payment_details
                              }
                              Razorpay.createPaymentLink(payload, payment, function (response) {
                                if (response) {
                                  var url = response.short_url.replace(/<[^>]*>/g, '')
                                  if (url) {
                                    invoiceEntry.retainer_invoice_id = response.id;
                                    invoiceEntry.paid_amount = final_amt;
                                    invoiceEntry.total_amount = final_amt;
                                    if (sub_mac[0] != undefined && sub_serial_no[0] != undefined) {
                                      var trans_mac = sub_mac.toString()
                                      var trans_serial = sub_serial_no.toString()
                                    } else {
                                      var trans_mac = ''
                                      var trans_serial = ''
                                    }
                                    var bulk_req = [
                                      {
                                        org_id: org.org_id,
                                        org_name: org.org_name,
                                        reseller_org_id: org.reseller_org_id,
                                        type: 'Credit',
                                        criteria: 'Direct',
                                        status: 'Pending',
                                        payment_method: 'Online',
                                        bundle: name,
                                        total_amount: final_amt,
                                        paid_amount: final_amt,
                                        retainer_invoice_id: response.id,
                                        invoice_acc_id: invoiceEntry.invoice_acc_id,
                                        invoice_year: invoiceEntry.invoice_year,
                                        invoice_id: invoiceEntry.invoice_id,
                                        name: sub_name.toString(),
                                        mobile: sub_mobile.toString(),
                                        mac_address: trans_mac,
                                        serial_no: trans_serial
                                      }
                                    ]
                                    if (availables != 0) {
                                      bulk_req.unshift({
                                        org_id: org.org_id,
                                        org_name: org.org_name,
                                        reseller_org_id: org.reseller_org_id,
                                        type: 'Debit',
                                        criteria: 'Direct',
                                        status: 'Pending',
                                        payment_method: 'Online',
                                        bundle: name,
                                        total_amount: availables,
                                        paid_amount: availables,
                                        retainer_invoice_id: response.id,
                                        invoice_acc_id: invoiceEntry.invoice_acc_id,
                                        invoice_year: invoiceEntry.invoice_year,
                                        invoice_id: invoiceEntry.invoice_id,
                                        name: sub_name.toString(),
                                        mobile: sub_mobile.toString(),
                                        mac_address: trans_mac,
                                        serial_no: trans_serial
                                      })
                                    }
                                    if (reseller_invoiceEntry.total_amount == 0) {
                                      reseller_invoiceEntry = {}
                                    }
                                    Subscription.update({ retainer_invoice_id: response.id }, { where: { subscription_id: renewalArrId } }).then(function (subscriber) {
                                      SubscriptionBundle.update({ retainer_invoice_id: response.id }, { where: { subscription_id: renewalArrId } }).then(function (sub_bundles) {
                                        Transaction.create(invoiceEntry, { include: [Invoice] }).then(function (trans) {
                                          if (oper.enable_reseller_bundle_creation) {
                                            Transaction.create(reseller_invoiceEntry, { include: [Invoice] }).then(function (reseller_trans) { })
                                          }
                                          Transaction.bulkCreate(bulk_req).then(function (trans) {
                                            res.status(200).send({ url: url })
                                          })
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
                  }
                } else {
                  if (oper.enable_reseller_bundle_creation) {
                    res.status(500).send("Insufficient Balance. Please contact your reseller");
                  }
                }
              }
            })
          })
        })
      })
    })
  }
})

router.put("/", VerifyToken, function (req, res) {
  var external_bundle_ids = [], selected_bundles = [], sms_ids = [];
  var url, expiryDate;
  var query = req.body;
  var allIptv = false
  var pre_set_flag = false;
  BundleResellerCustomPackage.findAll({ raw: true }).then(function (bundle_res) {
    BundleGroupedPackage.findAll({ raw: true }).then(function (grp_bundle) {
      Org.findOne({ raw: true, where: { org_id: req.orgId } }).then(function (org) {
        Org.findOne({ raw: true, where: { reseller_org_id: org.reseller_org_id, org_type: ['RESELLER', 'HEPI_RESELLER'] } }).then(function (reseller_org) {
          var org_provider_flag = ((org.provider_type == 'Independent') || (org.provider_type == 'Partner')) ? true : false
          OperatorSetting.findOne({ raw: true, where: { org_id: org.org_id } }).then(function (oper_org) {
            OperatorSetting.findOne({ raw: true, where: { org_id: reseller_org.org_id } }).then(function (reseller_oper) {
              BillSetting.findOne({ raw: true }).then(function (billsetting) {
                if (billsetting) {
                  const payment_details = {
                    payment_fields: billsetting.payment_fields,
                    api_get_payment_link: billsetting.api_get_payment_link,
                    api_payment_link_status: billsetting.api_payment_link_status
                  }
                  var payment_id = '';
                  var saleArr = [];
                  if (query.razorpay_invoice_id) {
                    payment_id = query.razorpay_invoice_id;
                  } else {
                    payment_id = query.razorpay_payment_id;
                    query.razorpay_invoice_id = query.razorpay_payment_link_id;
                  }
                  if (oper_org.enable_reseller_bundle_creation) {
                    var payment = {
                      payment_fields: reseller_oper.payment_fields,
                      api_get_payment_link: reseller_oper.api_get_payment_link,
                      api_payment_link_status: reseller_oper.api_payment_link_status,
                    }
                  } else {
                    var payment = payment_details
                  }
                  Razorpay.isPaymentSuccess(payment_id, payment, (data) => {
                    if (data && !isEmpty(data) && data.status == 'paid') {
                      SubscriptionBundle.findAll({ where: { retainer_invoice_id: query.razorpay_invoice_id }, include: [Bundle] }).then(function (find_sub_bundle) {
                        if (find_sub_bundle.length > 0) {
                          find_sub_bundle.map(function (iter, i) {
                            var iteration = iter.get({ plain: true })
                            if (iteration.bundle.is_external_packages) {
                              external_bundle_ids.push(iteration.bundle['bundle_id']);
                            }
                            if (i + 1 == find_sub_bundle.length) {
                              if ((query.checkIptv == 'true/') || (query.checkIptv == 'true')) {
                                Subscription.findAll({ where: { retainer_invoice_id: query.razorpay_invoice_id }, include: [SubscriptionBundle] }).then(function (sub) {
                                  var m2m_payload, m2mArr = [];
                                  var org_address = org.city + ', ' + org.state + ', ' + org.pincode
                                  if (sub[0].checkIptv) {
                                    sub.map(function (factor) {
                                      EMM.update({ status: 'Active' }, { where: { unique_id: factor.serial_no } }).then(function (emm_act) { });
                                      factor.subscription_bundles.map(function (pos) {
                                        if (org_provider_flag) {
                                          var bun_res_filter = bundle_res.filter(function (bund_res) {
                                            return (bund_res.bundle_id == pos.bundle_id)
                                          })
                                          if (bun_res_filter.length > 0) {
                                            bun_res_filter.map(function (iter) {
                                              if (iter.iptv && (!pos.bundle_name.includes('NCF'))) {
                                                sms_ids.push(iter.reseller_custom_bundle_id);
                                              } else {
                                                var grp_bundle_res = grp_bundle.filter(function (grp_data) {
                                                  return (grp_data.bundle_id == iter.reseller_custom_bundle_id)
                                                })
                                                grp_bundle_res.map(function (ip) {
                                                  if (ip.iptv) {
                                                    sms_ids.push(ip.grouped_bundle_id)
                                                  }
                                                })
                                              }
                                            })
                                          } else {
                                            if (pos.iptv) {
                                              sms_ids.push(pos.bundle_id)
                                            }
                                          }
                                        } else {
                                          if (pos.iptv) {
                                            sms_ids.push(pos.bundle_id)
                                          }
                                        }
                                      });
                                      m2mArr.push({
                                        activation_code: JSON.stringify(generateActivationCode(factor.email, org.short_code)),
                                        user_id: req.userId,
                                        org_id: (org.org_type == 'HEPI_OPERATOR') ? reseller_org.org_id : org.org_id,
                                        org_name: org.org_name,
                                        customer_firstname: factor.name,
                                        billing_address: org_address,
                                        billing_city: org.city,
                                        billing_pincode: org.pincode,
                                        installation_address: org_address,
                                        installation_city: org.city,
                                        installation_pincode: org.pincode,
                                        installation_state: org.state,
                                        billing_state: org.state,
                                        unique_id: factor.serial_no,
                                        serial_no: factor.serial_no,
                                        username: factor.name,
                                        email: factor.email,
                                        phone_number: factor.mobile,
                                        start_date: factor.activated_on,
                                        end_date: factor.expires_on,
                                        subscription_id: factor.subscription_id,
                                        customer_id: factor.subscription_id,
                                        customer_firstname: factor.name,
                                        is_auto_renew: factor.autorenewal,
                                        account_lock: 'Disable',
                                        name: factor.name,
                                        mac_address: factor.mac_address
                                      });
                                    });
                                    m2m_payload = {
                                      customer: m2mArr
                                    };
                                    url = '/api/partner/subscription';
                                  };
                                  sms_call(m2m_payload, url, sms_ids, req.userId, 'create', pre_set_flag)
                                  default_updation();
                                });
                              } else if ((query.checkIptv == 'false/') || (query.checkIptv == 'false')) {
                                Subscription.findOne({ where: { retainer_invoice_id: query.razorpay_invoice_id }, include: [SubscriptionBundle] }).then(function (subsc) {
                                  EMM.update({ status: 'Active' }, { where: { unique_id: subsc.serial_no } }).then(function (emm_act) {
                                  })
                                })
                                default_updation();
                              } else if (query.adjust_update) {
                                var newarr = [], delarr = [], samearr = [], getBundleId = [], base_bundle_updation_flag = false;
                                var month_mode = query.month_mode.replace('+', ' ');
                                Subscription.findOne({ where: { retainer_invoice_id: query.razorpay_invoice_id }, include: [SubscriptionBundle] }).then(function (customer) {
                                  EMM.update({ status: 'Active' }, { where: { unique_id: customer.serial_no } }).then(function (emm_act) { })
                                  var del_status_ids = []
                                  customer.subscription_bundles.map(function (del) {
                                    if (del.bundle_status = 'del' && !del.bundle_name.includes('NCF')) {
                                      del_status_ids.push(del.bundle_id)
                                    }
                                  })
                                  var body_expire = customer.expires_on
                                  var days = (renewalObj[month_mode]);
                                  var expiry = new Date();
                                  var expiryDate = new Date(expiry.setDate(expiry.getDate() + days)).setHours(23, 59, 59, 999);
                                  url = '/api/partner/edit';
                                  if (query.app == 'true/') {
                                    Subscription.update({ app: true }, { where: { retainer_invoice_id: query.razorpay_invoice_id } }).then(function (app_update) { })
                                  }
                                  var checkIptv = false;

                                  if (req.body.update_and_renew) {
                                    checkIptv = true;
                                    url = '/api/partner/renewal';
                                    var input_obj = {
                                      retainer_invoice_id: query.razorpay_invoice_id,
                                      [Op.or]: [
                                        {
                                          addon: true
                                        },
                                        {
                                          base: true
                                        }
                                      ]
                                    };
                                    SubscriptionBundle.findAll({ raw: true, where: input_obj }).then(function (get_bundle_list) {
                                      var get_bundle_id_list = get_bundle_list.map(function (data) {
                                        return data.bundle_id
                                      })
                                      SubscriptionPackage.update({ expiry_date: expiryDate }, { where: { bundle_id: get_bundle_id_list, subscription_id: get_bundle_list[0].subscription_id } }).then(function (update_date) {
                                        Subscription.update({ expires_on: expiryDate }, { where: { subscription_id: get_bundle_list[0].subscription_id } }).then(function (sub_updation) {
                                        })
                                      });
                                    });
                                  };
                                  SubscriptionBundle.findAll({ raw: true, where: { subscription_id: customer.subscription_id } }).then(function (get_bund) {
                                    get_bund.map(function (bund_data, x) {
                                      if (bund_data.addon && bund_data.bundle_status != 'del') {
                                        checkIptv = true;
                                      }

                                      var bun_res_filter = bundle_res.filter(function (bund_res) {
                                        return (bund_res.bundle_id == bund_data.bundle_id)
                                      })
                                      if (bun_res_filter.length > 0) {
                                        bun_res_filter.map(function (prod) {
                                          getBundleId.push(prod.reseller_custom_bundle_id)
                                          if (prod.iptv && bund_data.bundle_status == 'update') {
                                            sms_ids.push(prod.reseller_custom_bundle_id);
                                          } else {
                                            var grp_bundle_res = grp_bundle.filter(function (grp_data) {
                                              return (grp_data.bundle_id == prod.reseller_custom_bundle_id)
                                            })
                                            grp_bundle_res.map(function (ip) {
                                              getBundleId.push(ip.grouped_bundle_id)
                                              if (ip.iptv && bund_data.bundle_status == 'update') {
                                                sms_ids.push(ip.grouped_bundle_id)
                                              }
                                            })
                                          }
                                        })
                                      } else {
                                        if (bund_data.bundle_status != 'same') {
                                          getBundleId.push(bund_data.bundle_id)
                                        }
                                      }
                                      if (bund_data.bundle_status == 'new') {
                                        getBundleId.push(bund_data.bundle_id)
                                        newarr.push(bund_data)
                                      }
                                      if (bund_data.bundle_status == 'del') {
                                        getBundleId.push(bund_data.bundle_id)
                                        delarr.push(bund_data.bundle_id)
                                      }
                                      if (bund_data.bundle_status == 'same') {
                                        getBundleId.push(bund_data.bundle_id)
                                        samearr.push(bund_data.bundle_id)
                                      }
                                      if (bund_data.bundle_status == 'update') {
                                        getBundleId.push(bund_data.bundle_id)
                                        base_bundle_updation_flag = true;
                                      }
                                      if (base_bundle_updation_flag) {
                                        var activate_date = new Date().setHours(0, 0, 0, 0);
                                        var date_obj = { mode: month_mode, expires_on: expiryDate, activated_on: activate_date, name: query.name.replace('/', '') }
                                      } else {
                                        var date_obj = { mode: month_mode, expires_on: expiryDate, name: query.name.replace('/', '') }
                                      }
                                      if (x + 1 == get_bund.length) {
                                        duplicate(delarr, customer.subscription_id, getBundleId, samearr, [], base_bundle_updation_flag, body_expire, allIptv, expiryDate, oper_org.enable_reseller_bundle_creation, function (packoutput) {
                                          Subscription.update(date_obj, { where: { subscription_id: customer.subscription_id } }).then(function (sub_month) { })
                                          SubscriptionBundle.update({ bundle_status: '' }, { where: { subscription_id: customer.subscription_id } }).then(function (sub_bundle_update) { })
                                          EMM.update({ status: 'Active' }, { where: { unique_id: req.body.serial_no } }).then(function (emm_active) {
                                            var org_address = org.city + ', ' + org.state + ', ' + org.pincode;
                                            var serialNumber = req.body.serial_no.replace(/\+/g, '')
                                            var m2m_payload = {
                                              org_name: org.org_name,
                                              customer_id: customer.subscription_id,
                                              customer_firstname: customer.name,
                                              email: customer.email,
                                              phone_number: req.body.phone_number,
                                              username: customer.name,
                                              activation_code: JSON.stringify(generateActivationCode(customer.email, org.short_code)),
                                              user_id: req.userId,
                                              org_id: (org.org_type == 'HEPI_OPERATOR') ? reseller_org.org_id : org.org_id,
                                              billing_address: org_address,
                                              billing_city: org.city,
                                              billing_pincode: org.pincode,
                                              installation_address: org_address,
                                              installation_city: org.city,
                                              installation_pincode: org.pincode,
                                              installation_state: org.state,
                                              billing_state: org.state,
                                              unique_id: serialNumber,
                                              account_lock: 'Disable',
                                              start_date: new Date(),
                                              end_date: expiryDate,
                                              user_id: req.userId,
                                              is_auto_renew: customer.autorenewal,
                                              mac_address: req.body.mac_address,
                                              base_bundle_updation: base_bundle_updation_flag
                                            };
                                            if ((typeof (packoutput) == 'object') && packoutput.length > 0) {
                                              m2m_payload['deleted_packages'] = packoutput
                                            }
                                            url = '/api/partner/edit'
                                            if (checkIptv == true) {
                                              sms_ids = [...sms_ids, ...samearr]
                                              if (newarr.length > 0) {
                                                customer.subscription_bundles.map(function (pos) {
                                                  if (!pos.bundle_name.includes('NCF')) {
                                                    if (pos.iptv) {
                                                      if (!delarr.includes(pos.bundle_id)) {
                                                        sms_ids.push(pos.bundle_id)
                                                      }
                                                    };
                                                  }
                                                });
                                              }
                                            } else if (!checkIptv && del_status_ids.length > 0) {
                                              m2m_payload['remove_all_iptv'] = true;
                                              sms_ids = del_status_ids;
                                            }
                                            sms_call(m2m_payload, url, sms_ids, req.userId, 'create', pre_set_flag);
                                            default_updation();
                                          })
                                        })
                                      }
                                    })
                                  })
                                });
                              } else if (query.is_manual_renewal) {
                                BundlePackage.findAll({ raw: true }).then(function (bundlepack) {
                                  ProviderPackage.findAll({raw:true}).then(function(package_data){
                                  totalBundlePack = bundlepack;
                                  var renewalDb = [];
                                  SubscriptionPackage.findAll({ raw: true }).then(function (subscription_package) {
                                    totalSubscriptionPack = subscription_package;
                                    Subscription.findAll({ where: { retainer_invoice_id: query.razorpay_invoice_id }, include: [{ model: SubscriptionBundle, where: { retainer_invoice_id: query.razorpay_invoice_id }, attributes: { exclude: ['id'] } }] }).then(function (sub) {
                                      sub.map(function (point, count) {
                                        var sub_bundle = point.subscription_bundles[0];
                                        var point = point.get({ plain: true })
                                        var expiry = new Date();
                                        point.status = 'Active';
                                        var days = (renewalObj[point.mode]);
                                        var active_date = new Date().setHours(0, 0, 0, 0);
                                        point.activated_on = active_date;
                                        var expiry = new Date(expiry.setDate(expiry.getDate() + days)).setHours(23, 59, 59, 999);
                                        point.expires_on = expiry;
                                        var packfilter = totalSubscriptionPack.filter(function (prop) {
                                          return ((prop.bundle_id == sub_bundle.bundle_id) && ((prop.subscription_id == sub_bundle.subscription_id)))
                                        })
                                        packfilter.map(function (prop) {
                                          prop.expiry_date = expiry;
                                        })
                                        var salepackages = [];
                                        (point.subscription_bundles).map(function (proc) {
                                          if (proc && !proc.bundle_name.includes('NCF')) {
                                            var bun_res_filter = bundle_res.filter(function (bund_res) {
                                              return (bund_res.bundle_id == proc.bundle_id)
                                            })
                                            if (bun_res_filter.length > 0) {
                                              var id_list = []
                                              bun_res_filter.map(function (output) {
                                                if (output.iptv) {
                                                  id_list.push(output.reseller_custom_bundle_id)
                                                } else {
                                                  var grp_bundle_res = grp_bundle.filter(function (grp_data) {
                                                    return (grp_data.bundle_id == output.reseller_custom_bundle_id)
                                                  })
                                                  grp_bundle_res.map(function (ip) {
                                                    if (ip.iptv) {
                                                      id_list.push(ip.grouped_bundle_id)
                                                    }
                                                  })
                                                }
                                              })
                                              var packages = totalBundlePack.filter(function (entry) {
                                                delete entry.id;
                                                delete entry.createdAt
                                                delete entry.updatedAt
                                                entry.status = 'COMPLETED';
                                                if (entry.package_name.includes('-')) {
                                                  var iptv_package_name = entry.package_name.split('-');
                                                  entry.package_name = iptv_package_name[1];
                                                }
                                                entry.start_date = point.activated_on;
                                                return (id_list.includes(entry.bundle_id));
                                              });
					      packages.map(function(val){
                      				var amount=package_data.filter(function(package_info){
                       				 return package_info.package_id===val.package_id
                     			        })
                     			        val.charge=amount[0].amount
                                                val.payable=amount[0].amount
                                                val.charge_gst=Number((((val.charge * 18) / 100)).toFixed(2));
                                                val.payable_gst=Number((((val.payable * 18) / 100)).toFixed(2));
                                              })
                                              salepackages = [...salepackages, ...packages]
                                            } else {
                                              if (proc.iptv) {
                                                var packages = totalBundlePack.filter(function (entry) {
                                                  delete entry.id;
                                                  delete entry.createdAt
                                                  delete entry.updatedAt
                                                  entry.status = 'COMPLETED';
                                                  if (entry.package_name.includes('-')) {
                                                    var iptv_package_name = entry.package_name.split('-');
                                                    entry.package_name = iptv_package_name[1];
                                                  }
                                                  entry.start_date = point.activated_on;
                                                  return (entry.bundle_id == proc.bundle_id);
                                                });
			                        packages.map(function(val){
                                               	  var amount=package_data.filter(function(package_info){
                                                     return package_info.package_id===val.package_id
                                                  })
                                                  val.charge=amount[0].amount
                                                  val.payable=amount[0].amount
                                                  val.charge_gst=Number((((val.charge * 18) / 100)).toFixed(2));
                                                  val.payable_gst=Number((((val.payable * 18) / 100)).toFixed(2));
                                                })
                                                salepackages = [...salepackages, ...packages]
                                              }
                                            }
                                          };
                                        });
                                        if (point.checkIptv) {
                                          var serialsplit = point.serial_no.split("-")
                                          var serial_num = serialsplit[0].trim()
                                          saleArr.push({
                                            customer_id: point.subscription_id,
                                            activation_code: serial_num,
                                            customer_email: point.email,
                                            customer_firstname: point.name,
                                            start_date: point.activated_on,
                                            end_date: point.expires_on,
                                            is_active: 0,
                                            status: 'SKIE_RENEWAL',
                                            user_id: req.userId,
                                            customer_id: point.subscription_id,
                                            is_auto_renew: point.autorenewal,
                                            unique_id: point.serial_no,
                                            salespackages: salepackages
                                          });
                                        };
                                        point.subscription_package = packfilter;
                                        Subscription.update(point, { where: { retainer_invoice_id: query.razorpay_invoice_id, subscription_id: point.subscription_id } }).then(function (update_renewal) {
                                          sub_pack_update(point);
                                          if (count + 1 == sub.length) {
                                            default_updation();
                                            sms_renewal_call()
                                          };
                                        });
                                      });
                                    });
                                  });
                                  })
                                });
                              };
                            };
                          });
                        } else {
                          if (query.app == 'true/') {
                            Subscription.update({ app: true }, { where: { retainer_invoice_id: query.razorpay_invoice_id } }).then(function (app_update) { })
                          }
                          default_updation()
                        }
                      });
                    };
                    function sub_pack_update(renewalSubPack) {
                      if (renewalSubPack.subscription_package.length > 0) {
                        for (var i = 0; i < renewalSubPack.subscription_package.length; i++) {
                          var packData = renewalSubPack.subscription_package[i];
                          SubscriptionPackage.update(packData, { where: { subscription_id: renewalSubPack.subscription_id, package_id: packData.package_id } }).then(function (subscription_pack) { })
                        };
                      };
                    };
                    function sms_renewal_call() {
                      Provider.findAll({ raw: true }).then(function (providers) {
                        if (saleArr.length > 0 && saleArr[0].salespackages.length > 0) {
                          var provider_data = providers.filter(function (entry) {
                            return (entry.provider_id == saleArr[0].salespackages[0].provider_id);
                          });
                          var provider = provider_data[0];
                          var sms_payload = {
                            saleArr: saleArr
                          };
                          var obj = HTTPCli.M2MReq(provider.sms_host, provider.sms_port, 'POST', sms_payload, '/api/partner/renewal', provider.sms_token);
                          HTTPCli.https_to_SMS(obj, sucess_cb, error_cb);
                          function error_cb(err) {
                            sms_payload['sms_host'] = provider.sms_host;
                            sms_payload['sms_port'] = provider.sms_port;
                            sms_payload['sms_token'] = provider.sms_token;
                            sms_payload['api'] = '/api/partner/renewal';
                            var retry_key = 'payload' + random_number(options);
                            sms_payload['retry_key'] = retry_key;
                            sms_retry.set(retry_key, sms_payload);
                            sms_retry.save();
                          };
                          function sucess_cb(data) {
                            D && console.log("sucess", data);
                          };
                        };
                      });
                    };

                    function default_updation() {
                      Transaction.update({ status: 'Approved' }, { where: { retainer_invoice_id: query.razorpay_invoice_id } }).then(function (status) {
                        Subscription.update({ status: 'Active' }, { where: { retainer_invoice_id: query.razorpay_invoice_id, is_new: false } }).then(function (update_status) {
                          Subscription.update({ status: 'New' }, { where: { retainer_invoice_id: query.razorpay_invoice_id, is_new: true } }).then(function (update_status) {
                            SubscriptionBundle.update({ addon_status: true }, { where: { retainer_invoice_id: query.razorpay_invoice_id } }).then(function (addon_update) {
                              Transaction.findOne({ raw: true, where: { retainer_invoice_id: query.razorpay_invoice_id, type: ['Debit'], criteria: 'ManualRenewal' } }).then(function (trans) {
                                if (trans) {
                                  execute(trans.transaction_id)
                                } else {
                                  Transaction.findOne({ raw: true, where: { retainer_invoice_id: query.razorpay_invoice_id, type: ['Debit'], criteria: 'Direct' } }).then(function (trans) {
                                    execute(trans.transaction_id)
                                  });
                                };
                              }, function (err) {
                                res.status(500).send("There was a problem in adding the Subscription")
                              });
                              function execute(id) {
                                Transaction.findAll({ where: { transaction_id: id }, include: [Invoice] }).then(function (invoice) {
                                  Org.findOne({ raw: true, where: { org_id: invoice[0].org_id } }).then(function (org) {
                                    var file_name = 'Invoice.pdf';
                                    var arr = [];
                                    if (external_bundle_ids.length > 0) {
                                      Subscription.findAll({ where: { retainer_invoice_id: query.razorpay_invoice_id }, include: [SubscriptionBundle] }).then(function (data_sub) {
                                        var externflag, externData = data_sub;
                                        if (query.creation == 'bulkCreate/') {
                                          externData = data_sub
                                          externflag = 'multiple';
                                        } else if (query.is_manual_renewal) {
                                          externflag = 'renewal';
                                        } else {
                                          externflag = 'single';
                                          externData = data_sub[0]
                                        };
                                        external_apps_call(externflag, externData, external_bundle_ids, data_sub[0].expires_on, function (argument) {
                                          res.status(200).send("Subscription added successfully")
                                        })
                                      })
                                    } else {
                                    if(reseller_oper)
                                    {
                                      res.status(200).send("Subscription added successfully")
                                    }
                                    else
                                    {
                                      res.status(200).send("Subscription added successfully")
                                    }

                                    };
                                  }, function (err) {
                                    res.status(500).send("There was a problem in adding the Subscription")
                                  });
                                });
                              };
                            });
                          });
                        });
                      });
                    };
                  });
                };
              });
            });
          });
        });
      });
    })
  });
});


router.post('/adjustablePay', VerifyToken, function (req, res) {
  var redirection_url = req.body.redirection_url;
  var bulk_mobile = [], bulk_mac_address = [], bulk_serial_no = [], bulk_name = [];
  Org.findOne({ raw: true, where: { org_id: req.orgId } }).then(function (org) {
    Org.findOne({ raw: true, where: { reseller_org_id: org.reseller_org_id, org_type: ['RESELLER', 'HEPI_RESELLER'] } }).then(function (org_reseller) {
      OperatorSetting.findOne({ raw: true, where: { org_id: org.org_id } }).then(function (oper) {
        OperatorSetting.findOne({ raw: true, where: { org_id: org_reseller.org_id } }).then(function (oper_reseller) {
          BundleResellerCustomPackage.findAll({ raw: true }).then(function (bundle_reseller) {
            var org_provider_type = org_reseller.provider_type;
            var org_provider_flag = ((org_provider_type == 'Independent') || (org_provider_type == 'Partner')) ? true : false;
            BillSetting.findOne({ raw: true }).then(function (payment_details) {
              if (req.body.adjust_update && req.body.update_and_renew) {
                var callback_url = redirection_url + "?adjust_update=true&update_and_renew=true&mac_address=" + req.body.mac_address + "&serial_no=" + req.body.serial_no + "&phone_number=" + req.body.mobile + "&month_mode=" + req.body.mode + "&name=" + req.body.name + "/#/admin/subscription";
              } else if (req.body.adjust_update) {
                var callback_url = redirection_url + "?adjust_update=true&mac_address=" + req.body.mac_address + "&serial_no=" + req.body.serial_no + "&phone_number=" + req.body.mobile + "&month_mode=" + req.body.mode + "&name=" + req.body.name + "/#/admin/subscription";
              } else {
                if (req.body.bulkCreate) {
                  var callback_url = redirection_url + "?checkIptv=" + req.body.arr[0].checkIptv + "&mac_address=" + req.body.mac_address + "&serial_no=" + req.body.serial_no + "&phone_number=" + req.body.mobile + "&creation=bulkCreate/#/admin/subscription";
                } else {
                  var callback_url = redirection_url + "?checkIptv=" + req.body.checkIptv + "&mac_address=" + req.body.mac_address + "&serial_no=" + req.body.serial_no + "&phone_number=" + req.body.mobile + "&creation=singleCreate/#/admin/subscription";
                };
              };
              const payload = {
                amount: Number((req.body.adjusted_amount * 100).toFixed(2)),
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
              var ott_flag = false;
              if (oper.enable_reseller_bundle_creation) {
                var payment = {
                  payment_fields: oper_reseller.payment_fields,
                  api_get_payment_link: oper_reseller.api_get_payment_link,
                  api_payment_link_status: oper_reseller.api_payment_link_status,
                  custom_fields: oper_reseller.custom_fields,
                  request_type: oper_reseller.request_type
                }
              } else {
                var payment = payment_details
              }
              Razorpay.createPaymentLink(payload, payment, function (response) {
                if (response) {
                  var url = response.short_url.replace(/<[^>]*>/g, '')
                  if (url) {
                    req.body.org_id = req.orgId;
                    transaction_invoice(req.body, org, req.body.adjusted_amount, ott_flag, true, response.id, [], org_provider_flag, org_reseller, req.body.reseller_cost, function (invoiceEntry, reseller_invoiceEntry, getBundleId) {
                      var inv_bundle_name = (invoiceEntry.bundle) || req.body.bundle || req.body.updated_base_bundle.bundle_name
                      invoiceEntry.bundle = inv_bundle_name
                      req.body.subscription_bundles.map(function (data) {
                        data.retainer_invoice_id = response.id
                      })
                      if (req.body.bulkCreate && req.body.arr) {
                        req.body.arr.map(function (arr_content) {
                          arr_content.mobile = arr_content.mobile.replace('\r', '')
                          bulk_name.push(arr_content.name);
                          bulk_mobile.push(arr_content.mobile);
                          bulk_mac_address.push(arr_content.mac_address);
                          bulk_serial_no.push(arr_content.serial_no)
                        })
                      }
                      if (bulk_mac_address[0] != undefined && bulk_serial_no[0] != undefined) {
                        var mac_detail = bulk_mac_address.toString();
                        var serial_detail = bulk_serial_no.toString();
                      } else {
                        var mac_detail = '';
                        var serial_detail = '';
                      }
                      var bulk_req = [
                        {
                          org_id: req.orgId,
                          org_name: org.org_name,
                          reseller_org_id: org.reseller_org_id,
                          type: 'Credit',
                          criteria: 'Direct',
                          status: 'Pending',
                          payment_method: 'Online',
                          bundle: req.body.bundle || req.body.updated_base_bundle.bundle_name,
                          bundle: invoiceEntry.bundle,
                          total_amount: req.body.adjusted_amount,
                          paid_amount: req.body.adjusted_amount,
                          retainer_invoice_id: response.id,
                          invoice_acc_id: invoiceEntry.invoice_acc_id,
                          invoice_year: invoiceEntry.invoice_year,
                          invoice_id: invoiceEntry.invoice_id,
                          name: req.body.name || bulk_name.toString(),
                          mobile: req.body.mobile || bulk_mobile.toString(),
                          mac_address: req.body.mac_address || mac_detail,
                          serial_no: req.body.serial_no || serial_detail
                        }
                      ];
                      if (req.body.account_balance != 0) {
                        bulk_req.unshift({
                          org_id: req.orgId,
                          org_name: org.org_name,
                          reseller_org_id: org.reseller_org_id,
                          type: 'Debit',
                          criteria: 'Direct',
                          status: 'Pending',
                          payment_method: 'Online',
                          bundle: req.body.bundle || req.body.updated_base_bundle.bundle_name,
                          bundle: invoiceEntry.bundle,
                          total_amount: req.body.account_balance,
                          retainer_invoice_id: response.id,
                          invoice_acc_id: invoiceEntry.invoice_acc_id,
                          invoice_year: invoiceEntry.invoice_year,
                          invoice_id: invoiceEntry.invoice_id,
                          name: req.body.name || bulk_name.toString(),
                          mobile: req.body.mobile || bulk_mobile.toString(),
                          mac_address: req.body.mac_address || mac_detail,
                          serial_no: req.body.serial_no || serial_detail
                        });
                      };
                      var days = (renewalObj[req.body.mode]);
                      var expiry = new Date();
                      var expiryDate = new Date(expiry.setDate(expiry.getDate() + days)).setHours(23, 59, 59, 999);
                      var invoiceObj, getBundleId = [];
                      if (!req.body.bulkCreate && !req.body.adjust_update) {
                        req.body.expires_on = expiryDate;
                        req.body.retainer_invoice_id = response.id
                        req.body.reseller_org_id = org.reseller_org_id
                        req.body.org_id = org.org_id
                        req.body.activated_on = new Date().setHours(0, 0, 0, 0)
                        req.body.status = 'Pending'
                        var getBundleId = []
                        var addon_name = '';
                        bundle_invoice(req.body, req.body.subscription_bundles, invoiceEntry, getBundleId, addon_name, function (datas, getBundleId, addon_name, res_bund_name) {
                          BundlePackage.findAll({ raw: true, where: { bundle_id: getBundleId }, attributes: { exclude: ['id'] } }).then(function (bundlepack) {
                            var bundlepack = bundlepack.filter(function (thing, index) {
                              delete thing.id
                              return index === bundlepack.findIndex(function (obj) {
                                return obj.package_id === thing.package_id;
                              });
                            });
                            bundlepack.map(function (bp) {
                              bp.expiry_date = expiryDate
                            });
                            req.body.subscription_packages = bundlepack;
                            if (reseller_invoiceEntry.total_amount == 0) {
                              reseller_invoiceEntry = {}
                            }
                            invoiceEntry.name = req.body.name;
                            invoiceEntry.mobile = req.body.mobile;
                            invoiceEntry.mac_address = req.body.mac_address;
                            invoiceEntry.serial_no = req.body.serial_no;
                            reseller_invoiceEntry.name = req.body.name;
                            reseller_invoiceEntry.mobile = req.body.mobile;
                            reseller_invoiceEntry.mac_address = req.body.mac_address;
                            reseller_invoiceEntry.serial_no = req.body.serial_no;
                            Subscription.create(req.body, { include: [{ model: SubscriptionBundle }, { model: SubscriptionPackage }] }).then(function (subs) {
                              Transaction.create(invoiceEntry, { include: [Invoice] }).then(function (invoice) {
                                  Transaction.bulkCreate(bulk_req).then(function (trans) {
                                  if(oper.enable_reseller_bundle_creation){
                                     Transaction.create(reseller_invoiceEntry, { include: [Invoice] }).then(function (res_invoice) {})
                                  }
                                    res.status(200).send({ url: url })
                                  })
                               // })
                              })
                            }, function (err) {
                              if (err && err.errors[0].message) { return res.status(500).send(err.errors[0].message) }
                              res.status(500).send("Subscription creation failed");
                            })
                          });
                        })
                      } else if (req.body.bulkCreate) {
                        req.body.arr.map(function (arg) {
                          arg.expires_on = expiryDate;
                          arg.activated_on = new Date().setHours(0, 0, 0, 0);
                          arg.retainer_invoice_id = response.id;
                          arg.reseller_org_id = org.reseller_org_id;
                          arg.org_id = org.org_id;
                          arg.status = 'Pending';
                        })
                        req.body.status = 'Pending';
                        var dupeArr = [];
                        Subscription.findAll({ raw: true }).then(function (checkSubs) {
                          req.body.arr.map(function (input) {
                            if (checkSubs.some(function (item) { return ((item.email == input.email) || (item.mobile == input.mobile)) })) {
                              dupeArr.push(input)
                            }
                          })
                          if (dupeArr.length > 0) {
                            res.status(500).send({ dupe: dupeArr });
                          } else {
                            var bulkfinal = [];
                            var subscription = req.body.arr
                            var bundles = req.body.subscription_bundles
                            var sub_id = [], getBundleId = [];
                            for (var i = 0; i < subscription.length; i++) {
                              var sub_index = subscription[i]
                              sub_id.push(sub_index.subscription_id);
                              sub_index.status = 'New';
                              sub_index.org_id = org.org_id;
                              sub_index.reseller_org_id = org.reseller_org_id;
                              sub_index.expires_on = expiryDate;
                              var subscription_id = sub_index.subscription_id;
                              for (var j = 0; j < bundles.length; j++) {
                                var bundle_index = bundles[j]
                                var ip = bundle_index;
                                delete bundle_index.id
                                bundle_index.subscription_id = subscription_id
                                var copied_bundle = Object.assign({}, bundle_index);
                                bulkfinal.push(copied_bundle)
                                ip.retainer_invoice_id = response.id;
                                getBundleId.push(ip.bundle_id);
                                if (ip.add_on) {
                                  var inv_object = {
                                    bund_name: ip.bundle_name,
                                    mode: req.body.mode,
                                    quantity: req.body.arr.length,
                                    status: 'Payment'
                                  }
                                  if (ip.bundle_type == 'custompackage') {
                                    inv_object['rate'] = ip.bundle_cost;
                                    inv_object['amt'] = (ip.bundle_cost * req.body.arr.length);
                                  } else {
                                    inv_object['rate'] = ip[month];
                                    inv_object['amt'] = (ip[month] * req.body.arr.length);
                                  }
                                  invoiceEntry.invoices.push(inv_object)
                                }
                              }
                            }
                            bulkfinal.map(function (ele) {
                              if (ele.add_on)
                                ele['retainer_invoice_id'] = response.id
                            })
                            BundlePackage.findAll({ raw: true, where: { bundle_id: getBundleId }, attributes: { exclude: ['id', 'createdAt', 'updatedAt'] } }).then(function (bundlepack) {
                              var bundlepack = bundlepack.filter(function (thing, index) {
                                delete thing.id
                                return index == bundlepack.findIndex(function (obj) {
                                  return obj.package_id === thing.package_id;
                                })
                              })

                              var subPackArr = [];
                              sub_id.map(function (property) {
                                bundlepack.map(function (bp) {
                                  bp.expiry_date = expiryDate
                                  bp.subscription_id = property
                                  var copied_pack = Object.assign({}, bp);
                                  subPackArr.push(copied_pack)
                                })
                              })
                              if (reseller_invoiceEntry.total_amount == 0) {
                                reseller_invoiceEntry = {}
                              }
                              if (bulk_mac_address[0] != undefined && bulk_serial_no[0] != undefined) {
                                invoiceEntry.mac_address = bulk_mac_address.toString();
                                invoiceEntry.serial_no = bulk_serial_no.toString();
                                reseller_invoiceEntry.mac_address = bulk_mac_address.toString();
                                reseller_invoiceEntry.serial_no = bulk_serial_no.toString();
                              }
                              invoiceEntry.name = bulk_name.toString();
                              invoiceEntry.mobile = bulk_mobile.toString();
                              reseller_invoiceEntry.name = bulk_name.toString();
                              reseller_invoiceEntry.mobile = bulk_mobile.toString();
                              Subscription.bulkCreate(req.body.arr).then(function (subs) {
                                SubscriptionBundle.bulkCreate(bulkfinal).then(function (sub_bundle) {
                                  SubscriptionPackage.bulkCreate(subPackArr).then(function (sub_pack) {
                                    Transaction.create(invoiceEntry, { include: [Invoice] }).then(function (invoice) {
                                    if(oper.enable_reseller_bundle_creation){
                                        Transaction.create(reseller_invoiceEntry, { include: [Invoice] }).then(function (res_invoice) {})
                                    }
                                        Transaction.bulkCreate(bulk_req).then(function (trans) {
                                          res.status(200).send({ url: url })
                                        })
                                      //})
                                    })
                                  })
                                })
                              }, function (err) {
                                if (err && err.errors[0].message) { return res.status(500).send(err.errors[0].message) }
                                res.status(500).send("Subscription creation failed");
                              })
                            })
                          }
                        })
                      } else {
                        if (req.body.base_bundle_updation) {
                          invoiceObj = {
                            bund_name: req.body.updated_base_bundle.bundle_name,
                            mode: req.body.mode,
                            quantity: 1,
                            status: 'Payment'
                          }
                          if (req.body.updated_base_bundle.bundle_type == custompackage) {
                            invoiceObj['amt'] = req.body.updated_base_bundle.bundle_cost;
                            invoiceObj['rate'] = req.body.updated_base_bundle.bundle_cost;
                          } else {
                            invoiceObj['amt'] = req.body.updated_base_bundle[month];
                            invoiceObj['rate'] = req.body.updated_base_bundle[month];
                          }
                          getBundleId.push(req.body.updated_base_bundle.bundle_id)
                          SubscriptionBundle.destroy({ where: { base: true, bundle_id: req.body.exist_base_bundleid, subscription_id: req.body.subscription_id } }).then(function (delete_bundle) {
                            SubscriptionBundle.create({
                              retainer_invoice_id: response.id,
                              bundle_name: req.body.updated_base_bundle.bundle_name,
                              bundle_id: req.body.updated_base_bundle.bundle_id,
                              addon: false,
                              base: true,
                              non_iptv_status: 'Active',
                              iptv: req.body.updated_base_bundle.iptv,
                              org_id: req.orgId,
                              subscription_id: req.body.subscription_id

                            }).then(function (base_creation) { })
                          })
                        }
                        var id_list = [];
                        Subscription.findOne({ where: { subscription_id: req.body.subscription_id }, include: [SubscriptionBundle] }).then(function (customer) {
                          customer.subscription_bundles.map(function (ids) {
                            id_list.push(ids.bundle_id);
                          })
                          Bundle.findAll({ raw: true, where: { bundle_id: id_list } }).then(function (customer_bundle) {
                            invoiceEntry.invoices = [];
                            var all_bundle_ids = [];
                            var bun_filter_name = ''
                            function getAllInvoices(argument, text, cb) {
                              if (argument.length == 0) {
                                cb(0)
                              }
                              argument.map(function (ip, count) {
                                if ((text == 'same') && req.body.base_bundle_updation) {
                                  bun_filter_name = (bun_filter_name == '') ? ip.bundle_name : bun_filter_name + ',' + ip.bundle_name;
                                }
                                if ((text == 'new')) {
                                  bun_filter_name = (bun_filter_name == '') ? ip.bundle_name : bun_filter_name + ',' + ip.bundle_name;
                                }
                                if (ip.bundle_id != undefined) {
                                  all_bundle_ids.push(ip.bundle_id);
                                  getBundleId.push(ip.bundle_id);
                                }
                                delete ip.id;
                                ip['retainer_invoice_id'] = response.id;
                                if ((ip.bundle_type == bundlepackage) || (ip.bundle_type == custompackage)) {
                                  invoiceEntry.invoices.push({
                                    bund_name: ip.bundle_name,
                                    mode: req.body.mode,
                                    rate: (ip.bundle_type == bundlepackage) ? ip[month] : ip.bundle_cost,
                                    quantity: 1,
                                    status: 'Payment',
                                    prorated_day: '- ' + req.body.no_of_days + ' days prorated',
                                    amt: (ip.bundle_type == bundlepackage) ? Number(((ip[month] / dayObj[req.body.mode]) * req.body.no_of_days).toFixed(2)) : Number(((ip.bundle_cost / dayObj[req.body.mode]) * req.body.no_of_days).toFixed(2))
                                  })
                                }
                                if (ip.bundle_type == externalpackage) {
                                  invoiceEntry.invoices.push({
                                    bund_name: ip.bundle_name,
                                    mode: req.body.mode,
                                    rate: ip[month],
                                    quantity: 1,
                                    status: 'Payment',
                                    amt: ip[month]
                                  })
                                }
                                if (count + 1 == (argument.length)) {
                                  cb(invoiceEntry);
                                }
                              })
                            }
                            getAllInvoices(req.body.newarr_on_edit, 'new', function (data) {
                              getAllInvoices(req.body.samearr_on_edit, 'same', function (datas) {
                                getAllInvoices(req.body.reupdatearr_on_edit, 'reupdate', function (data_value) {
                                  getAllInvoices(req.body.delarr_on_edit, 'del', function (del_data_value) {
                                    customer.subscription_bundles.map(function (arg) {
                                      var filter = customer_bundle.filter(function (prop) {
                                        return (prop.bundle_id == arg.bundle_id)
                                      })
                                    })
                                    if (req.body.account_balance != 0) {
                                      invoiceEntry.invoices.push({
                                        bund_name: addon_name,
                                        mode: req.body.mode,
                                        status: 'Adjustment',
                                        amt: req.body.account_balance
                                      })
                                    }

                                    var final_bundle_name = '';
                                    if (req.body.base_bundle_updation) {
                                      final_bundle_name = (final_bundle_name == '') ? req.body.updated_base_bundle.bundle_name : final_bundle_name + ',' + req.body.updated_base_bundle.bundle_name;
                                    }
                                    if (addon_name) {
                                      final_bundle_name = (final_bundle_name == '') ? addon_name : final_bundle_name + ',' + addon_name;
                                    }
                                    if (bun_filter_name) {
                                      final_bundle_name = (final_bundle_name == '') ? bun_filter_name : final_bundle_name + ',' + bun_filter_name;
                                    }
                                    invoiceEntry['bundle'] = final_bundle_name
                                    var subpack_new_arr = [], subpack_update_arr = [];
                                    invoiceEntry.invoices.push(invoiceObj)
                                    bulk_req.map(function (bulk) {
                                      bulk.bundle = final_bundle_name;
                                    })
                                    if (reseller_invoiceEntry.total_amount == 0) {
                                      reseller_invoiceEntry = {}
                                    }
                                    invoiceEntry.name = req.body.name;
                                    invoiceEntry.mobile = req.body.mobile;
                                    invoiceEntry.mac_address = req.body.mac_address;
                                    invoiceEntry.serial_no = req.body.serial_no;
                                    reseller_invoiceEntry.name = req.body.name;
                                    reseller_invoiceEntry.mobile = req.body.mobile;
                                    reseller_invoiceEntry.mac_address = req.body.mac_address;
                                    reseller_invoiceEntry.serial_no = req.body.serial_no;
                                    if(oper.enable_reseller_bundle_creation){
                                      Transaction.create(reseller_invoiceEntry, { include: [Invoice] }).then(function (trans) {})
                                    }
                                      Transaction.create(invoiceEntry, { include: [Invoice] }).then(function (trans) {
                                        Transaction.bulkCreate(bulk_req).then(function (trans) {
                                          req.body.newarr_on_edit.map(function (new_bundle) {
                                            new_bundle.bundle_status = 'new'
                                          })
                                          var same_bundle = []
                                          req.body.samearr_on_edit.map(function (same_arr) {
                                            same_bundle.push(same_arr.bundle_id)
                                          })
                                          SubscriptionBundle.update({ bundle_status: 'same' }, { where: { bundle_id: same_bundle, subscription_id: req.body.subscription_id } }).then(function (samearr) {
                                            SubscriptionBundle.update({ bundle_status: 'del' }, { where: { bundle_id: req.body.delarr_on_edit } }).then(function (delarr) {
                                              if (req.body.base_bundle_updation == true) {
                                                SubscriptionBundle.update({ bundle_status: 'update' }, { where: { bundle_id: req.body.updated_base_bundle.bundle_id, subscription_id: req.body.subscription_id } }).then(function (updatearr) {
                                                })
                                              }
                                            })
                                          })

                                          SubscriptionBundle.bulkCreate(req.body.newarr_on_edit).then(function (create_new) {
                                            var update_obj = { retainer_invoice_id: response.id, checkIptv: req.body.checkIptv }
                                            if (req.body.mac_address) { update_obj['mac_address'] = req.body.mac_address, update_obj['serial_no'] = req.body.serial_no }
                                            SubscriptionBundle.update({ retainer_invoice_id: response.id }, { where: { bundle_id: all_bundle_ids, subscription_id: req.body.subscription_id } }).then(function (update_retainer_id) {
                                              Subscription.update(update_obj, { where: { subscription_id: req.body.subscription_id } }).then(function (update_sub) {
                                                SubscriptionPackage.findAll({ raw: true, where: { subscription_id: req.body.subscription_id } }).then(function (exist_package) {
                                                  BundlePackage.findAll({ raw: true, where: { bundle_id: getBundleId }, attributes: { exclude: ['id'] } }).then(function (bundlepacks) {
                                                    var old_packages = getPackages(exist_package);
                                                    if (bundlepacks.length > 0) {
                                                      for (var i = 0; i < bundlepacks.length; i++) {
                                                        var new_package = bundlepacks[i];
                                                        var pack_id = new_package.package_id;
                                                        new_package.createdAt = new Date();
                                                        new_package.subscription_id = req.body.subscription_id;
                                                        if (old_packages[pack_id]) {
                                                          new_package.expiry_date = expiryDate;
                                                          subpack_update_arr.push(new_package)
                                                        } else {
                                                          if (!subpack_new_arr.some(function (item) { return (item.package_id) })) {
                                                            new_package.expiry_date = expiryDate;
                                                            subpack_new_arr.push(new_package)
                                                          }
                                                        }
                                                        if (i + 1 == bundlepacks.length) {
                                                          SubscriptionPackage.bulkCreate(subpack_new_arr).then(function (create_sub_pack) {
                                                            if (subpack_update_arr.length > 0) {
                                                              for (var z = 0; z < subpack_update_arr.length; z++) {
                                                                var pack_data = subpack_update_arr[z];
                                                                SubscriptionPackage.update(pack_data, { where: { package_id: pack_data.package_id, subscription_id: pack_data.subscription_id } }).then(function (update_sub_pack) {
                                                                })
                                                              }
                                                              if ((subpack_update_arr.length) == z) {
                                                                res.status(200).send({ url: url })
                                                              }
                                                            } else {
                                                              res.status(200).send({ url: url })
                                                            }
                                                          })
                                                        }
                                                      }
                                                    } else {
                                                      res.status(200).send({ url: url })
                                                    }
                                                  })
                                                })
                                              }, function (err) {
                                              })
                                            })
                                          })
                                        })
                                      })
                                    //})
                                  })
                                })
                              })
                            })
                          })
                        })
                      }
                    });
                  } else {
                    res.status(500).send("Subscription creation failed");
                  }
                }
              });
            });
          })
        })
      });
    })
  });
});

router.put('/:subscription_id', VerifyToken, function (req, res) {
  var url;
  var addon_name = '', reseller_cost = 0, reseller_cost_with_gst = 0;
  var month = keyObj[req.body.mode];
  var days = (renewalObj[req.body.mode]);
  var date = new Date();
  var expiry = new Date();
  var expiryDate = new Date(expiry.setDate(expiry.getDate() + days)).setHours(23, 59, 59, 999);
  var id_list = [];
  var add_on_without_gst = 0, add_on_with_gst = 0;
  var external_bundle_ids = [], getBundleId = [], sms_ids = [];
  var invoiceObj = {};
  var reupdate_invoice_arr = [];
  var allIptv = false;
  req.body.base_bundle = req.body.bundle
  var pre_set_flag = false;
  if (req.body.status == 'Pending') {
    return res.status(500).send('Since the payment for this subscription has failed, Unable to update')
  }
  if ((req.body.serial_no == '') || (req.body.serial_no == null) || (req.body.serial_no == 'null')) {
    delete req.body.serial_no;
  }
  if ((req.body.mac_address == '') || (req.body.mac_address == null) || (req.body.mac_address == 'null')) {
    delete req.body.mac_address;
  }
  if (req.body.mac_address) {
    req.body.mac_address = req.body.mac_address.trim();
  }
  var iptv_expiry_date = '';
  if (req.body.is_iptv && !req.body.ncf_already_added && req.body.ncf_bundle) {
    req.body.ncf_bundle['addon'] = true;
    req.body.ncf_bundle['base'] = false;
    req.body.ncf_bundle['addon_status'] = true;
    req.body.org_id = req.orgId;
    req.body.newarr.push(req.body.ncf_bundle)
  }
  if (req.body.ncf_bundle && req.body.ncf_bundle.bundle_id && req.body.is_iptv && ((req.body.base_bundle_updation) || (req.body.update_and_renew))) {
    req.body.samearr.push(req.body.ncf_bundle.bundle_id)
  }
  if (!req.body.is_iptv && req.body.ncf_already_added && req.body.ncf_bundle && req.body.ncf_bundle.bundle_id) {
    req.body.delarr.push(req.body.ncf_bundle.bundle_id)
  }
  Subscription.findOne({ where: { subscription_id: req.body.subscription_id }, include: [SubscriptionBundle] }).then(function (customer) {
    OperatorSetting.findOne({ raw: true, where: { org_id: customer.org_id } }).then(function (oper) {
      Org.findOne({ raw: true, where: { org_id: req.orgId } }).then(function (org) {
        Org.findOne({ raw: true, where: { reseller_org_id: org.reseller_org_id, org_type: ['RESELLER', 'HEPI_RESELLER'] } }).then(function (orgs_reseller) {
          var org_provider_type = orgs_reseller.provider_type;
          BundleResellerCustomPackage.findAll({ raw: true }).then(function (bundle_reseller) {
            BundleGroupedPackage.findAll({ raw: true }).then(function (grp_bundle) {
              creditCalculation.Calculate({ org_id: orgs_reseller.org_id }, res_cb)
              function res_cb(argument) {
                if (argument.status == 200) {
                if (argument.msg.status == 'failed' && !oper.pre_activation_flag && oper.enable_reseller_bundle_creation) { return res.status(500).send("Insufficient Balance. Please contact your reseller") }
                  var reseller_account_balance =(!isCreditEmpty(argument.msg.object)) ?  Number(argument.msg.object.toFixed(2)) : 0 ;
                  customer.subscription_bundles.map(function (ids) {
                    id_list.push(ids.bundle_id);
                  })
                  Bundle.findAll({ raw: true, where: { bundle_id: id_list } }).then(function (customer_bundle) {
                    if (req.body.base_bundle_updation) {
                      invoiceObj = {
                        bund_name: req.body.base_bundle.bundle_name,
                        mode: req.body.mode,
                        quantity: 1,
                        status: 'Payment'
                      }
                      if (req.body.base_bundle.bundle_type == resellerpackage) {
                        if ((org_provider_type == 'Independent') && (!req.body.base_bundle.addon)) {
                          reseller_cost += req.body.base_bundle.ott_price;
                        } else {
                          reseller_cost += req.body.base_bundle.recommend_cost;
                        }
                        add_on_without_gst = add_on_without_gst + req.body.base_bundle.seller_cost;
                        req.body.base_bundle.bundle_reseller_custom_packages.map(function (input) {
                          if (input.iptv && req.body.base_bundle_updation) {
                            sms_ids.push(input.reseller_custom_bundle_id)
                          } else {
                            var grp_filter = grp_bundle.filter(function (grp_entry) {
                              return grp_entry.bundle_id == input.reseller_custom_bundle_id
                            })
                            grp_filter.map(function (ip) {
                              if (ip.iptv && req.body.base_bundle_updation) {
                                sms_ids.push(ip.grouped_bundle_id)
                              }
                            })
                          }
                        })
                      } else if (req.body.base_bundle.bundle_type == custompackage) {
                        add_on_without_gst = add_on_without_gst + req.body.base_bundle.bundle_cost;
                        invoiceObj['amt'] = req.body.base_bundle.bundle_cost;
                        invoiceObj['rate'] = req.body.base_bundle.bundle_cost;
                      } else {
                        add_on_without_gst = add_on_without_gst + req.body.base_bundle[month];
                        invoiceObj['amt'] = req.body.base_bundle[month];
                        invoiceObj['rate'] = req.body.base_bundle[month];
                      }
                      if (req.body.bundle.is_external_packages) {
                        external_bundle_ids.push(req.body.bundle.bundle_id)
                      }
                    }
                    var samearr_on_edit = [], reupdatearr_on_edit = [];
                    if ((req.body.newarr.length > 0) || (req.body.base_bundle_updation)) {
                      var date = new Date();
                      var firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
                      var credit_obj = {
                        org_id: req.orgId,
                        status: 'Approved',
                        time_stamp: { [Op.between]: [firstDay, date] }
                      }
                      creditCalculation.Calculate({ org_id: req.orgId }, cb)
                      function cb(data) {
                        if (data.status == 200) {
                          var account_balance = 0;
                          account_balance = Number(data.msg.object).toFixed(2)
                          var expires = new Date(req.body.expires_on)
                          var enddate = new Date(req.body.expires_on).setHours(23, 59, 99, 999)
                          var startdate = new Date().setHours(23, 59, 99, 99)
                          var no_of_days = parseInt((enddate - startdate) / (1000 * 60 * 60 * 24)) + 1;
                          var amt_per_day;
                          var month = keyObj[req.body.mode]
                          var ott_flag = false;
                          var ott_amt = 0, ott_amt_with_gst = 0;
                          req.body.newarr.map(function (arg) {
                            delete arg.id;
                            arg.org_id = req.orgId;
                            if (arg.bundle_type == resellerpackage) {
                              if (!arg.bundle_name.includes('NCF')) {
                                if (org_provider_type == 'Independent' && !arg.addon) {
                                  reseller_cost += arg.ott_price;
                                } else {
                                  reseller_cost += arg.recommend_cost;
                                }
                              }
                              var bun_res_filter = bundle_reseller.filter(function (bund_res) {
                                return (bund_res.bundle_id == arg.bundle_id)
                              })
                              amt_per_day = (arg.seller_cost / dayObj[req.body.mode]);
                              add_on_without_gst = (add_on_without_gst + (amt_per_day * no_of_days));
                            } else {
                              if ((arg.bundle_type == bundlepackage) || (arg.bundle_type == custompackage) || (arg.bundle_type == groupedpackage)) {
                                amt_per_day = (arg.bundle_type == custompackage) ? (arg.bundle_cost / dayObj[req.body.mode]) : (arg[month] / dayObj[req.body.mode]);
                                add_on_without_gst = (arg.bundle_type == custompackage) ? (add_on_without_gst + (amt_per_day * no_of_days)) : (add_on_without_gst + (amt_per_day * no_of_days));
                              }
                              if (arg.bundle_type == externalpackage) {
                                add_on_without_gst = add_on_without_gst + arg[month];
                              }
                              if (arg.is_external_packages) {
                                external_bundle_ids.push(arg.bundle_id)
                              }
                            }
                          })
                          if ((req.body.samearr.length > 0) && (req.body.update_and_renew || req.body.base_bundle_updation)) {
                            var arr_filter;
                            arr_filter = req.body.samearr;
                            var bun_filter_name = ''
                            arr_filter.map(function (same_reupdate_arr_bundle, x) {
                              var bundle_filter = customer_bundle.filter(function (props) {
                                return (props.bundle_id == same_reupdate_arr_bundle)
                              })
                              if (bundle_filter.length > 0) {
                                samearr_on_edit.push(bundle_filter[0])
                              }
                              if (bundle_filter.length > 0) {
                                var bun_filter = bundle_filter[0];
                                if (bun_filter.iptv) {
                                  addon_name = (addon_name == '') ? bun_filter.bundle_name : addon_name + ', ' + bun_filter.bundle_name
                                }
                                reInvoiceObj = {
                                  bund_name: bun_filter_name,
                                  mode: req.body.mode,
                                  quantity: 1,
                                  status: 'Payment'
                                }
                                if (bun_filter.bundle_type == resellerpackage) {
                                  add_on_without_gst = add_on_without_gst + bun_filter.seller_cost
                                } else {
                                  if (bun_filter.bundle_type == custompackage) {
                                    add_on_without_gst = add_on_without_gst + bun_filter.bundle_cost
                                    reInvoiceObj['amt'] = bun_filter.bundle_cost;
                                    reInvoiceObj['rate'] = bun_filter.bundle_cost;
                                  }
                                  else {
                                    add_on_without_gst = add_on_without_gst + bun_filter[month]
                                    reInvoiceObj['amt'] = bun_filter[month];
                                    reInvoiceObj['rate'] = bun_filter[month];
                                  }
                                  reupdate_invoice_arr.push(reInvoiceObj)
                                }
                              }
                            })
                          }
                          reseller_cost_with_gst = Number((reseller_cost + ((reseller_cost * 18) / 100)).toFixed(2));
                          var add_on_with_gst = Number((add_on_without_gst + ((add_on_without_gst * 18) / 100)).toFixed(2))
                          var ip_arr = [];
			  var balance_check = (oper.enable_reseller_bundle_creation) ? reseller_account_balance : account_balance;
                          if (balance_check >= reseller_cost_with_gst) {
                            if (account_balance >= add_on_with_gst) {
                              if (req.body.base_bundle_updation) {
                                if (req.body.base_bundle_updation.bundle_type != resellerpackage) {
                                  getBundleId.push(req.body.base_bundle.bundle_id)
                                } else {
                                  var bun_res_filter = bundle_reseller.filter(function (bund_res) {
                                    return (bund_res.bundle_id == req.body.base_bundle.bundle_id)
                                  })
                                  if (bun_res_filter.length > 0) {
                                    bun_res_filter.map(function (item) {
                                      getBundleId.push(item.reseller_custom_bundle_id)
                                    })
                                  }
                                }

                                req.body.expires_on = expiryDate
                                SubscriptionBundle.destroy({ where: { base: true, bundle_id: req.body.exist_base_bundleid, subscription_id: req.params.subscription_id } }).then(function (delete_bundle) {
                                  SubscriptionBundle.create({
                                    bundle_name: req.body.base_bundle.bundle_name,
                                    bundle_id: req.body.base_bundle.bundle_id,
                                    addon: false,
                                    base: true,
                                    non_iptv_status: 'Active',
                                    iptv: req.body.base_bundle.iptv,
                                    org_id: req.orgId,
                                    subscription_id: req.params.subscription_id
                                  })
                                })
                              }
                              SubscriptionBundle.update({ addon_status: true }, { where: { bundle_id: req.body.reupdatearr, subscription_id: req.params.subscription_id } }).then(function (reupdate) {
                                SubscriptionBundle.update({ addon_status: true }, { where: { bundle_id: req.body.samearr, subscription_id: req.params.subscription_id } }).then(function (reupdate) {
                                  Transaction.findOne({ raw: true, where: { invoice_year: new Date().getFullYear() }, order: [['trans_id', 'DESC']], limit: 1 }).then(function (trans) {
                                    var invoiceEntry = {
                                      org_id: req.orgId,
                                      org_name: org.org_name,
                                      reseller_org_id: org.reseller_org_id,
                                      type: 'Debit',
                                      status: 'Approved',
                                      payment_method: 'Offline',
                                      criteria: 'Direct',
                                      total_amount: add_on_with_gst,
                                      invoices: []
                                    }
                                    var reseller_invoiceEntry = {
                                      org_id: orgs_reseller.org_id,
                                      org_name: orgs_reseller.org_name,
                                      reseller_org_id: orgs_reseller.reseller_org_id,
                                      type: 'Debit',
                                      status: 'Approved',
                                      payment_method: 'Offline',
                                      criteria: 'Direct',
                                      total_amount: reseller_cost_with_gst,
                                      invoices: []
                                    }
                                    if (trans) {
                                      if (trans.invoice_year == new Date().getFullYear()) {
                                        invoiceEntry.invoice_acc_id = trans.invoice_acc_id + 1
                                        invoiceEntry.invoice_year = new Date().getFullYear()
                                        invoiceEntry.invoice_id = 'INV-' + invoiceEntry.invoice_year + 'AC' + invoiceEntry.invoice_acc_id
                                      } else {
                                        invoiceEntry.invoice_acc_id = 1
                                        invoiceEntry.invoice_year = new Date().getFullYear()
                                        invoiceEntry.invoice_id = 'INV-' + invoiceEntry.invoice_year + 'AC' + invoiceEntry.invoice_acc_id
                                      }
                                    } else {
                                      invoiceEntry.invoice_acc_id = 1
                                      invoiceEntry.invoice_year = new Date().getFullYear()
                                      invoiceEntry.invoice_id = 'INV-' + invoiceEntry.invoice_year + 'AC' + invoiceEntry.invoice_acc_id
                                    }
                                    var bundlename_type = '';
                                    req.body.samearr.map(function (same) {
                                    })
                                    req.body.newarr.map(function (ip) {
                                      if (ip.bundle_type == resellerpackage) {
                                        var bun_res_filter = bundle_reseller.filter(function (bund_res) {
                                          return (bund_res.bundle_id == ip.bundle_id)
                                        })
                                        if (bun_res_filter.length > 0) {
                                          bun_res_filter.map(function (item) {
                                            getBundleId.push(item.reseller_custom_bundle_id);
                                          })
                                        }
                                      } else {
                                        getBundleId.push(ip.bundle_id);
                                      }
                                      ip.addon_status = true;
                                      ip.subscription_id = req.params.subscription_id;
                                      if (ip.iptv) {
                                        addon_name = (addon_name == '') ? ip.bundle_name : addon_name + ', ' + ip.bundle_name
                                      }
                                      if ((ip.bundle_type == bundlepackage) || (ip.bundle_type == custompackage)) {
                                        invoiceEntry.invoices.push({
                                          bund_name: ip.bundle_name,
                                          mode: req.body.mode,
                                          rate: (ip.bundle_type == bundlepackage) ? ip[month] : ip.bundle_cost,
                                          quantity: 1,
                                          status: 'Payment',
                                          prorated_day: '- ' + no_of_days + ' days prorated',
                                          amt: (ip.bundle_type == bundlepackage) ? Number(((ip[month] / dayObj[req.body.mode]) * no_of_days).toFixed(2)) : Number(((ip.bundle_cost / dayObj[req.body.mode]) * no_of_days).toFixed(2))
                                        })
                                      }
                                      if (ip.bundle_type == externalpackage) {
                                        invoiceEntry.invoices.push({
                                          bund_name: ip.bundle_name,
                                          mode: req.body.mode,
                                          rate: ip[month],
                                          quantity: 1,
                                          status: 'Payment',
                                          amt: ip[month]
                                        })
                                      }
                                    })
                                    if (ip_arr.length > 0) {
                                      invoiceEntry.invoices = [...invoiceEntry.invoices, ...ip_arr]
                                    }
                                    invoiceEntry.invoices.push({
                                      bund_name: addon_name,
                                      mode: req.body.mode,
                                      status: 'Adjustment',
                                      amt: add_on_with_gst
                                    })
                                    var final_bundle_name = '';
                                    if (req.body.base_bundle_updation) {
                                      final_bundle_name = (final_bundle_name == '') ? req.body.base_bundle.bundle_name : final_bundle_name + ',' + req.body.base_bundle.bundle_name;
                                    }
                                    if (addon_name) {
                                      final_bundle_name = (final_bundle_name == '') ? addon_name : final_bundle_name + ',' + addon_name;
                                    }
                                    if (bun_filter_name) {
                                      final_bundle_name = (final_bundle_name == '') ? bun_filter_name : final_bundle_name + ',' + bun_filter_name;
                                    }
                                    invoiceEntry['bundle'] = final_bundle_name
                                    invoiceEntry['total_amount'] = add_on_with_gst;
                                    invoiceEntry['paid_amount'] = 0;
                                    if (req.body.base_bundle_updation) {
                                      getBundleId.push(req.body.base_bundle.bundle_id)
                                      req.body.activated_on = new Date().setHours(0, 0, 0, 0)
                                    }
                                    if (invoiceObj) {
                                      invoiceEntry.invoices.push(invoiceObj)
                                    }
                                    invoiceEntry.invoices = [...invoiceEntry.invoices, ...reupdate_invoice_arr]
                                    if (req.body.update_and_renew) { req.body.status = 'Active'; req.body.activated_on = new Date() }
                                    req.body.bundle = req.body.bundle.bundle_name
                                    if (reseller_invoiceEntry.total_amount == 0) {
                                      reseller_invoiceEntry = {}
                                    }
                                    invoiceEntry.name = req.body.name;
                                    invoiceEntry.mobile = req.body.mobile;
                                    invoiceEntry.mac_address = req.body.mac_address;
                                    invoiceEntry.serial_no = req.body.serial_no;
                                    reseller_invoiceEntry.name = req.body.name;
                                    reseller_invoiceEntry.mobile = req.body.mobile;
                                    reseller_invoiceEntry.mac_address = req.body.mac_address;
                                    reseller_invoiceEntry.serial_no = req.body.serial_no;
                                    Subscription.update(req.body, { where: { subscription_id: req.params.subscription_id } }).then(function (data) {
                                      Transaction.create(invoiceEntry, { include: [Invoice] }).then(function (trans) {
                                      if(oper.enable_reseller_bundle_creation){
                                       Transaction.create(reseller_invoiceEntry, { include: [Invoice] }).then(function (rese_trans) {})
                                     }
                                          SubscriptionBundle.bulkCreate(req.body.newarr).then(function (create_new) {
                                            duplicate(req.body.delarr, req.params.subscription_id, getBundleId, req.body.samearr, req.body.reupdatearr, req.body.base_bundle_updation, req.body.expires_on, allIptv, expiryDate, oper.enable_reseller_bundle_creation, function (packoutput) {
                                              sendInvoice(trans.transaction_id, 'Invoice.pdf', callbk)
                                              function callbk(msg) {
                                                var org_address = org.city + ', ' + org.state + ', ' + org.pincode;
                                                var m2m_payload = {
                                                  org_name: org.org_name,
                                                  customer_id: req.params.subscription_id,
                                                  customer_firstname: req.body.name,
                                                  email: req.body.email,
                                                  phone_number: req.body.phone_number,
                                                  username: req.body.name,
                                                  activation_code: JSON.stringify(generateActivationCode(req.body.email, org.short_code)),
                                                  user_id: req.userId,
                                                  org_id: (org.org_type == 'HEPI_OPERATOR') ? orgs_reseller.org_id : org.org_id,
                                                  billing_address: org_address,
                                                  billing_city: org.city,
                                                  billing_pincode: org.pincode,
                                                  installation_address: org_address,
                                                  installation_city: org.city,
                                                  installation_pincode: org.pincode,
                                                  installation_state: org.state,
                                                  billing_state: org.state,
                                                  unique_id: req.body.serial_no,
                                                  account_lock: 'Disable',
                                                  start_date: new Date(),
                                                  end_date: req.body.expires_on,
                                                  user_id: req.userId,
                                                  is_auto_renew: customer.autorenewal,
                                                  mac_address: req.body.mac_address,
                                                  base_bundle_updation: req.body.base_bundle_updation
                                                };
                                                if ((typeof (packoutput) == 'object') && packoutput.length > 0) {
                                                  m2m_payload['deleted_packages'] = packoutput
                                                }
                                                url = '/api/partner/edit';
                                                if (req.body.checkIptv) {
                                                  sms_ids = [...sms_ids, ...req.body.samearr]
                                                  if (req.body.newarr.length > 0) {
                                                    req.body.newarr.map(function (pos) {
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
                                                          }
                                                        }
                                                      }
                                                    })
                                                  }
                                                }
                                                if (!req.body.checkIptv && req.body.delarr.length > 0) {
                                                  m2m_payload['remove_all_iptv'] = true;
                                                  sms_ids = req.body.delarr;
                                                }
                                                if (external_bundle_ids.length > 0) {
                                                  Subscription.findOne({ raw: true, where: { subscription_id: req.params.subscription_id } }).then(function (data_sub) {
                                                    external_apps_call('single', data_sub, external_bundle_ids, data_sub.expires_on, function (argument) {
                                                      sms_call(m2m_payload, url, sms_ids, req.userId, 'create', pre_set_flag);
                                                      res.status(200).send("Subscription updated Successfully");
                                                    })
                                                  })
                                                } else {
                                                  if (!req.body.checkIptv && req.body.delarr.length > 0) {
                                                    m2m_payload['remove_all_iptv'] = true;
                                                    sms_ids = req.body.delarr;
                                                  }
                                                  sms_call(m2m_payload, url, sms_ids, req.userId, 'create', pre_set_flag);
                                                  res.status(200).send("Subscription updated Successfully");
                                                }
                                              }
                                            })
                                          })
                                       // })
                                      })
                                    })
                                  })
                                })
                              })
                            } else {
                              req.body.newarr.map(function (ip) {
                                ip.subscription_id = req.params.subscription_id;
                              })
                              var finalAmt = add_on_with_gst - account_balance
                              if (account_balance > 0) {
                                var msg = "Rs " + account_balance + " been adjusted with the credit"
                              } else {
                                var msg = "No Credit available please make the payment to proceed!"
                              }
                              res.status(200).send({
                                msg: msg,
                                btn: "Make Rs." + finalAmt + " payment to complete",
                                account_balance: account_balance,
                                adjusted_amount: finalAmt,
                                newarr: req.body.newarr,
                                samearr: samearr_on_edit,
                                reupdatearr: reupdatearr_on_edit,
                                no_of_days: no_of_days,
                                app: req.body.app,
                                base_bundle_updation: req.body.base_bundle_updation,
                                updated_base_bundle: req.body.base_bundle,
                                exist_base_bundleid: req.body.exist_base_bundleid,
                                delarr: req.body.delarr,
                                reseller_cost: reseller_cost_with_gst
                              });
                            }
                          } else{
                            if(oper.enable_reseller_bundle_creation){
                            res.status(500).send("Insufficient Balance. Please contact your reseller")
                           }
                          } 
                        }
                      }
                    } else {
                      req.body.bundle = req.body.bundle.bundle_name
                      if (!req.body.checkIptv && req.body.delarr.length > 0) {
                        getBundleId = req.body.delarr;
                        allIptv = true;
                      }
                      Subscription.findOne({ where: { subscription_id: req.params.subscription_id }, include: [SubscriptionBundle] }).then(function (subscription_data) {
                        var sms_all_ids = [];
                        if (req.body.name != subscription_data.name || req.body.mobile != subscription_data.mobile || req.body.email != subscription_data.email) {
                          subscription_data.subscription_bundles.map(function (pos) {
                            if (pos.iptv) {
                              sms_all_ids.push(pos.bundle_id)
                            }
                          })
                        }
                        Subscription.update(req.body, { where: { subscription_id: req.params.subscription_id } }).then(function (data) {
                          duplicate(req.body.delarr, req.params.subscription_id, getBundleId, req.body.samearr, req.body.reupdatearr, req.body.base_bundle_updation, req.body.expires_on, allIptv, expiryDate, oper.enable_reseller_bundle_creation, function (pack_output) {
                            var org_address = org.city + ', ' + org.state + ', ' + org.pincode
                            var m2m_payload = {
                              org_name: org.org_name,
                              customer_id: req.params.subscription_id,
                              customer_firstname: req.body.name,
                              email: req.body.email,
                              phone_number: req.body.phone_number,
                              username: req.body.name,
                              activation_code: JSON.stringify(generateActivationCode(req.body.email, org.short_code)),
                              user_id: req.userId,
                              org_id: (org.org_type == 'HEPI_OPERATOR') ? orgs_reseller.org_id : org.org_id,
                              billing_address: org_address,
                              billing_city: org.city,
                              billing_pincode: org.pincode,
                              installation_address: org_address,
                              installation_city: org.city,
                              installation_pincode: org.pincode,
                              installation_state: org.state,
                              billing_state: org.state,
                              unique_id: req.body.serial_no,
                              account_lock: 'Disable',
                              start_date: new Date(),
                              end_date: req.body.expires_on,
                              user_id: req.userId,
                              is_auto_renew: customer.autorenewal,
                              mac_address: req.body.mac_address,
                              base_bundle_updation: req.body.base_bundle_updation,
                            };
                            if (!req.body.checkIptv && req.body.delarr.length > 0) {
                              m2m_payload['remove_all_iptv'] = true;
                              sms_ids = req.body.delarr;
                              var url = '/api/partner/edit';
                              sms_call(m2m_payload, url, sms_ids, req.userId, 'create', pre_set_flag);
                            } else {
                              if ((typeof (pack_output) == 'object') && pack_output.length > 0) {
                                m2m_payload['deleted_packages'] = pack_output
                              }
                              m2m_payload['remove_sale_pack'] = true;
                              sms_ids = req.body.delarr;
                              var url = '/api/partner/edit';
                              sms_ids = (sms_ids.length == 0) ? sms_all_ids : sms_ids;
                              sms_call(m2m_payload, url, sms_ids, req.userId, 'create', pre_set_flag);
                            }
                            if (data == 0) {
                              res.status(500).send("Subscription updation failed")
                            }
                            if (data > 0) {
                              res.status(200).send("Subscription updated successfully")
                            }
                          })
                        }, function (err) {
                          if (err && err.errors[0].message) { return res.status(500).send(err.errors[0].message) } //DUPLICATE ENTRY FOR UNIQUE FIELD
                          res.status(500).send(err)
                        })
                      })
                    }
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

router.get("/oper/filter/:org_id/:limit/:offset", VerifyToken, function (req, res) {
  var obj = { org_id: req.params.org_id }
  var limit = req.params.limit;
  var off = (req.params.offset == 0) ? 0 : (req.params.offset - 1) * limit
  Subscription.findAndCountAll({ where: obj, limit: Number(limit), offset: Number(off), include: [{ model: AccessLogin }, { model: SubscriptionBundle }, { model: Org, as: 'subscriberOrg' }], order: [['createdAt', 'DESC']] }).then(function (all_type_info) {
    if (all_type_info.rows.length > 0) {
      getTotalPages(all_type_info, limit, function (obj) {
        res.status(200).send(obj);
      });
    } else {
      res.status(200).send({ count: 0, rows: [] });
    }
  },
    function (err) {
      res.status(500).send("Problem in finding Subscription");
    })
})

router.delete("/:subscription_id/:flag", VerifyToken, function (req, res) {
  var pre_set_flag = false;
  Subscription.findOne({ where: { subscription_id: req.params.subscription_id }, include: [SubscriptionBundle] }).then(function (sub) {
    AccessLogin.findOne({ raw: true, where: { subscription_id: req.params.subscription_id } }).then(function (login) {
      if (login && (req.params.flag == 'delete')) {
        logoutAndDelete.execute(req.params.subscription_id, login.device_type, login.device_id, cb)
        function cb(data) {
          if (data) {
            Subscription.destroy({ where: { subscription_id: req.params.subscription_id } }).then(function (subscription) {
              PreActiveSubscription.destroy({ where: { subscription_id: req.params.subscription_id } }).then(function (pre_subscription) { })
              EMM.update({ status: 'Inactive' }, { where: { unique_id: sub.serial_no } }).then(function (emm_update) { })
              delete_call(sub, req.userId, pre_set_flag, call_bk)
              function call_bk(datas) {
                res.status(200).send(datas)
              }
            })
          }
        }
      } else if (!login && (req.params.flag == 'delete')) {
        Subscription.destroy({ where: { subscription_id: req.params.subscription_id } }).then(function (subscription) {
          PreActiveSubscription.destroy({ where: { subscription_id: req.params.subscription_id } }).then(function (pre_subscription) { })
          EMM.update({ status: 'Inactive' }, { where: { unique_id: sub.serial_no } }).then(function (emm_update) { })
          delete_call(sub, req.userId, pre_set_flag, call_bk)
          function call_bk(datas) {
            res.status(200).send(datas)
          }
        })
      } else if (req.params.flag == 'logout') {
        logoutAndDelete.execute(req.params.subscription_id, login.device_type, login.device_id, cb)
        function cb(data) {
          if (data) {
            res.status(200).send("Subscription Logout Successfully")
          }
        }
      }
    })
  })
})

function delete_call(subscription, userId, pre_set_flag, call_bk) {
  var bundleId = [], sms_ids = [], m2m_payload = {};
  subscription.subscription_bundles.map(function (sub_bundle) {
    bundleId.push(sub_bundle.bundle_id)
  })

  Bundle.findAll({
    where: { bundle_id: bundleId },
    include: [
      { model: BundlePackage },
      { model: BundleResellerCustomPackage },
      { model: BundleGroupedPackage }
    ]
  }).then(function (bundle) {
    if (subscription.checkIptv) {
      bundle.map(function (pos) {
        if (!pos.bundle_name.includes('NCF')) {
          if (pos.bundle_type == 'resellerpackage') {
            var res_pack = pos.bundle_reseller_custom_packages
            res_pack.map(function (res_data) {
              if (res_data.iptv) {
                sms_ids.push(res_data.reseller_custom_bundle_id)
              } else {
                if (pos.bundle_type == 'groupedpackage') {
                  var grp_filter = pos.bundle_grouped_packages.filter(function (grp_entry) {
                    return grp_entry.bundle_id == res_data.reseller_custom_bundle_id
                  })
                  grp_filter.map(function (ip) {
                    if (ip.iptv) {
                      sms_ids.push(ip.grouped_bundle_id)
                    }
                  })
                }
              }
            })
          } else if (pos.bundle_type == 'groupedpackage') {
            var grp_filter = pos.bundle_grouped_packages.filter(function (grp_entry) {
              return grp_entry.bundle_id == pos.bundle_id
            })
            grp_filter.map(function (ip) {
              if (ip.iptv) {
                sms_ids.push(ip.grouped_bundle_id)
              }
            })

          } else {
            if (pos.iptv) {
              sms_ids.push(pos.bundle_id)
            };
          }
        }
      })
      var url = '/api/partner/subscriber_delete';
      m2m_payload['subscription_id'] = subscription.subscription_id;
      sms_call(m2m_payload, url, sms_ids, userId, 'delete', pre_set_flag);
    }
    call_bk("Subscription Deleted Successfully")
  })
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

router.post('/search', VerifyToken, function (req, res) {
  var term = req.body.term
  var input = '%' + term + '%'
  var obj = {
    [Op.or]: [
      { name: { [Op.like]: input } },
      { mobile: { [Op.like]: input } },
      { email: { [Op.like]: input } },
      { mode: { [Op.like]: input } },
      { bundle: { [Op.like]: input } },
      { status: { [Op.like]: input } },
      { serial_no: { [Op.like]: input } },
      { mac_address: { [Op.like]: input } }
    ]
  }
  if ((req.role == 'OPERATOR') || (req.role == 'RESELLER') || (req.role == 'HEPI_OPERATOR') || (req.role == 'HEPI_RESELLER')) {
    obj.org_id = req.orgId
  }
  var limit = req.body.limit;
  var off = (req.body.offset == 0) ? 0 : (req.body.offset - 1) * limit
  Subscription.findAndCountAll({ where: obj, limit: Number(limit), offset: Number(off), include: [{ model: AccessLogin }, { model: SubscriptionBundle }, { model: Org, as: 'subscriberOrg' }], order: [['createdAt', 'DESC']] }).then(function (all_type_info) {
    if (all_type_info.rows.length > 0) {
      getTotalPages(all_type_info, limit, function (obj) {
        res.status(200).send(obj)
      });
    } else {
      res.status(200).send({ count: 0, rows: [] })
    }
  },
    function (err) {
      res.status(500).send("Problem in finding Subscription");
    })
})

module.exports = router;
