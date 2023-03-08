var express = require('express'),
  router = express.Router(),
  bodyParser = require('body-parser'),
  transactionReceipt = require(__root + __core + 'modules/transactionReceipt.js'),
  fs = require('fs'),
  editJsonFile = require('edit-json-file'),
  conf = editJsonFile(__root + 'config.json'),
  Razorpay = require(__root + __core + 'modules/razorpayOld'),
  VerifyToken = require(__root + __core + 'modules/VerifyToken'),
  creditCalculation = require(__root + __core + 'modules/creditCalculation'),
  transactionPDF = require(__root + __core + 'modules/TransactionPDFTemplate.js'),
  Mailer = require(__root + __core + 'modules/Mailer');

router.use(bodyParser.json());
var Transaction = __db_model.Transaction,
  User = __db_model.User,
  Org = __db_model.Org,
  BillSetting = __db_model.BillSetting,
  Invoice = __db_model.Invoice,
  OperatorSetting = __db_model.OperatorSetting;

function isEmpty(obj) {
  for (var key in obj) {
    if (obj.hasOwnProperty(key))
      return false;
  }
  return true;
}

function create_transaction(arr, cb) {
  Transaction.bulkCreate(arr).then(function (credit) {
    cb({ status: 200, msg: "Transaction created successfully" });
  }, function (err) {
    cb({ status: 500, msg: "Transaction creation failed" });
  })
}
// CREATES A NEW ORG
router.post('/', VerifyToken, function (req, res) {
  var arr = [], moqArr = [];
  var request = req.body;
  User.findOne({ raw: true, where: { user_id: req.userId } }).then(function (user) {
    request.org_id = user.org_id
    request.reseller_org_id = user.reseller_org_id
    OperatorSetting.findOne({ raw: true, where: { org_id: user.org_id } }).then(function (oper) {
      if(req.body.moq_slab_list && req.body.moq_slab_list.length > 0){
        req.body.moq_slab_list.map(function(data){
          data.start_date = new Date(new Date(data.start_date).setUTCHours(0,0,0,0));
          data.end_date = new Date(new Date(data.end_date).setUTCHours(23,59,59,999));
          moqArr.push(data)
        });
      };
      if ((oper.moq_slab_list == null) || (oper.moq_slab_list.length == 0)) {
        OperatorSetting.update({ moq_slab_list: moqArr }, { where: { org_id: user.org_id } }).then(function (oper_update) {
        }, function (err) { })
      }
      Org.findOne({ raw: true, where: { org_id: user.org_id } }).then(function (org) {
        if (req.body.credit_type == 'Credit') {
          if (req.body.carry_forwarded > 0) {
            var carry_entry = {
              org_id: org.org_id,
              org_name: org.org_name,
              reseller_org_id: org.reseller_org_id,
              bundle: req.body.bundle,
              type: 'Credit',
              payment_method: req.body.payment_method,
              total_amount: req.body.carry_forwarded,
              paid_amount: req.body.carry_forwarded,
              status: req.body.status,
              criteria: 'Direct',
              is_moq: true,
              carry_forwarded: req.body.carry_forwarded,
              enable_reseller_bundle_creation: req.body.enable_reseller_bundle_creation
            }
            arr.push(carry_entry);
          }
          var trans_entry = {
            org_id: org.org_id,
            org_name: org.org_name,
            reseller_org_id: org.reseller_org_id,
            bundle: req.body.bundle,
            type: 'Credit',
            payment_method: req.body.payment_method,
            total_amount: req.body.total_amount,
            paid_amount: req.body.total_amount,
            status: req.body.status,
            criteria: 'Direct',
            is_moq: req.body.oper_moq,
            carry_forwarded: req.body.carry_forwarded,
            reference_number: req.body.reference_number,
            enable_reseller_bundle_creation: req.body.enable_reseller_bundle_creation
          }
          arr.push(trans_entry);
        }
        BillSetting.findOne({ raw: true }).then(function (payment_details) {
          request.org_name = org.org_name
          Transaction.findOne({ raw: true, where: { type: 'Credit' }, order: [['receipt_number', 'DESC']], limit: 1 }).then(function (trans) {
            var amount = req.body.total_amount
            if (trans) {
              request.receipt_number = trans.receipt_number + 1
            } else {
              request.receipt_number = 1
            }
            request['paid_amount'] = req.body.total_amount;
            if (request.payment_method == 'Online') {
              var redir_url = request.redirection_url + "/#/admin/transaction";
              const payload = {
                amount: Number(Math.round(amount * 100)),
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
                callback_url: redir_url,
                callback_method: "get"
              };
              if ((org.org_type == 'OPERATOR' || org.org_type == 'HEPI_OPERATOR') && oper.enable_reseller_bundle_creation) {
                var orgid = req.resellerOrgId
              } else {
                var orgid = req.orgId
              }
              Org.findOne({ raw: true, where: { org_id: orgid } }).then(function (org_sett) {
                OperatorSetting.findOne({ raw: true, where: { org_id: org_sett.org_id } }).then(function (oper_sett) {
                  if (oper.enable_reseller_bundle_creation  && (oper.type == 'OPERATOR' || oper.type == 'HEPI_OPERATOR')) {
                    var payment = {
                      payment_fields: oper_sett.payment_fields,
                      api_get_payment_link: oper_sett.api_get_payment_link,
                      api_payment_link_status: oper_sett.api_payment_link_status,
                      custom_fields: oper_sett.custom_fields,
                      request_type: oper_sett.request_type
                    }
                  } else {
                    var payment = payment_details
                  }
                  Razorpay.createPaymentLink(payload, payment, function (response) {
                    if (response) {
                      var url = response.short_url.replace(/<[^>]*>/g, '')
                      if (url) {
                        request['retainer_invoice_id'] = response.id;
                        arr.map(function (data) {
                          data['retainer_invoice_id'] = response.id;
                        })
                        create_transaction(arr, function (output) {
                          res.status(output.status).send(url);
                        })
                      }
                    } else {
                      res.status(500).send("Transaction failed ,try after sometime")
                    }
                  }, function (err) {
                    res.status(500).send("Transaction failed ,try after sometime 1")
                  });
                });
              });
            } else if (request.payment_method == 'Offline') {
              if (request.credit_type == 'Operator Credit') {
                arr = [];
                var operator_entry = {
                  org_id: req.body.org_details.org_id,
                  org_name: req.body.org_details.org_name,
                  reseller_org_id: req.body.org_details.reseller_org_id,
                  bundle: req.body.bundle,
                  type: 'Credit',
                  payment_method: 'Offline',
                  total_amount: req.body.total_amount,
                  paid_amount: req.body.total_amount,
                  status: 'Approved',
                  criteria: 'Direct',
                  is_moq: req.body.oper_moq,
                  reference_number: req.body.reference_number,
                  enable_reseller_bundle_creation: req.body.enable_reseller_bundle_creation
                }
                arr.push(operator_entry);
                OperatorSetting.findOne({ raw: true, where: { org_id: req.body.org_details.org_id } }).then(function (operator_org) {
                  if ((operator_org.moq_slab_list == null) || (operator_org.moq_slab_list.length == 0)) {
                    OperatorSetting.update({ moq_slab_list: req.body.moq_slab_list }, { where: { org_id: operator_org.org_id } }).then(function (operator_update) {
                    }, function (err) {
                    })
                  }
                })
              }
              create_transaction(arr, function (output) {
                res.status(output.status).send(output.msg);
              })
            }
          })
        })
      })
    })
  })
});

// RETURNS ALL THE ORG IN THE DATABASE
router.get('/get/:credit_type/:start_date/:end_date', VerifyToken, function (req, res) {
  var start_date_new = new Date(req.params.start_date);
  var end_date_new = new Date(req.params.end_date);
  User.findOne({ raw: true, where: { user_id: req.userId } }).then(function (user_info) {
    var obj = {
      'criteria': 'Direct',
      time_stamp: {
        [Op.gte]: start_date_new.setHours(0, 0, 0, 0),
        [Op.lte]: end_date_new.setHours(23, 59, 59, 999)
      },
    };
    if (user_info.roles != 'FINANCE') {
      if (req.params.credit_type == 'Credit') {
        obj["org_id"] = user_info.org_id
      } else {
        obj["reseller_org_id"] = user_info.reseller_org_id
        obj["org_id"] = {
          [Op.ne]: user_info.org_id
        }
      }
    }
    Transaction.findAll({ where: obj, order: [['createdAt', 'DESC']] }).then(function (credit) {
      res.status(200).send(credit)
    }, function (err) {
      res.status(500).send("There was a problem in finding the Transaction")
    })
  })
});

router.get('/get/:limit/:offset/:credit_type/:start_date/:end_date', VerifyToken, function (req, res) {
  var start_date = new Date(req.params.start_date)
  var end_date = new Date(req.params.end_date)
  User.findOne({ raw: true, where: { user_id: req.userId } }).then(function (user_info) {
    var obj = {
      'criteria': 'Direct',
      time_stamp: {
        [Op.gte]: start_date.setHours(0, 0, 0, 0),
        [Op.lte]: end_date.setHours(23, 59, 59, 999)
      },
    };
    if (user_info.roles != 'FINANCE') {
      if (req.params.credit_type == 'Credit') {
        obj["org_id"] = user_info.org_id
      } else {
        obj["reseller_org_id"] = user_info.reseller_org_id
        obj["org_id"] = {
          [Op.ne]: user_info.org_id
        }
      }
    }
    var limit = req.params.limit;
    var off = (req.params.offset == 0) ? 0 : (req.params.offset - 1) * limit
    Transaction.findAndCountAll({ where: obj, limit: Number(limit), offset: Number(off), order: [['createdAt', 'DESC']] }).then(function (credit) {
      var roundoff = Math.round(credit.count / limit);
      var page_list = credit.count / limit;
      if (roundoff < page_list) {
        page_list = roundoff + 1;
      } else {
        page_list = roundoff;
      }
      credit.count = page_list;
      res.status(200).send(credit)
    }, function (err) {
      res.status(500).send("There was a problem in finding the Transaction")
    })
  })
});

router.get('/:transaction_id', VerifyToken, function (req, res) {
  Transaction.findOne({ where: { transaction_id: req.params.transaction_id }, include: [Invoice] }).then(function (transaction) {
    if (transaction.invoices.length == 0) {
      Transaction.findOne({ where: { invoice_id: transaction.invoice_id, invoice_acc_id: transaction.invoice_acc_id }, include: [Invoice] }).then(function (transact) {
        execute(transact)
      })
    } else {
      execute(transaction)
    }
    function execute(trans) {
      Org.findOne({ raw: true, where: { org_id: trans.org_id } }).then(function (org) {
        if (trans.type == 'Credit') {
          var file_name = 'Receipt.pdf';
          transactionReceipt.create(file_name, org, trans, function (path) {
            cb(path);
          });
        } else {
          var file_name = 'Invoice.pdf';
          transactionPDF.create(file_name, [], org, trans, function (path) {
            cb(path);
          });
        }
        function cb(path) {
          fs.readFile(path.filename, 'base64', function (err, res_content) {
            var payload = {
              file_name: file_name,
              payload: res_content
            }
            res.status(200).send(payload)
          });
        }
      })
    }
  }, function (err) {
    res.status(500).send("There was a problem in finding the Transaction")
  })
});

router.get('/slab/data/:start_date/:end_date/:oper_id', VerifyToken, function (req, res) {
  var start_date = new Date(req.params.start_date);
  var end_date = new Date(req.params.end_date);
  OperatorSetting.findOne({ raw: true, where: { org_id: req.params.oper_id } }).then(function (oper) {
    var obj = {
      org_id: req.params.oper_id,
      type: 'Credit',
      time_stamp: {
        [Op.between]: [start_date, end_date]
      },
      status: 'Approved'
    }
    creditCalculation.getCarryForward({ start_date: start_date }, oper, cb)
    function cb(argument) {
      Transaction.findAll({ raw: true, where: obj, order: [['createdAt', 'ASC']] }).then(function (credit) {
        if (credit == null) {
          res.status(200).send({ trans: [], carry_forwarded: argument.msg.carry_forwarded })
        } else {
          res.status(200).send({ trans: credit, carry_forwarded: argument.msg.carry_forwarded })
        }
      }, function (err) {
        res.status(500).send("There was a problem in finding the Transaction")
      })
    }
  })
})

router.get('/credit/calculation', VerifyToken, function (req, res) {
  User.findOne({
    raw: true,
    where: {
      user_id: req.userId
    }
  }).then(function (user) {
    var date = new Date();
    var firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    var obj = {
      time_stamp: {
        [Op.between]: [firstDay, date]
      },
      status: 'Approved'
    }

    if (user.roles == 'OPERATOR' || user.roles == 'HEPI_OPERATOR') {
      obj.org_id = user.org_id
    }
    if (user.roles == 'RESELLER' || user.roles == 'HEPI_RESELLER') {
      obj.reseller_org_id = user.reseller_org_id
      obj.org_id = user.org_id
    }
    creditCalculation.Calculate(obj, cb)

    function cb(data) {
      res.status(data.status).send(data.msg)
    }
  })
})

router.put("/update_payment_status", VerifyToken, function (req, res) {
  var query = req.body.query
  if (req.body.reseller_condition == 1 && (req.role == 'OPERATOR' || req.role == 'HEPI_OPERATOR')) {
    var orgid = req.resellerOrgId
  } else {
    var orgid = req.orgId
  }
  OperatorSetting.findOne({ raw: true, where: { org_id: orgid } }).then(function (oper_sett) {
    BillSetting.findOne({
      raw: true
    }).then((billsetting) => {
      if (billsetting) {
        const payment_details = {
          payment_fields: billsetting.payment_fields,
          api_get_payment_link: billsetting.api_get_payment_link,
          api_payment_link_status: billsetting.api_payment_link_status
        }
        if (oper_sett.enable_reseller_bundle_creation == 1 && (req.role == 'OPERATOR' || req.role == 'HEPI_OPERATOR')) {
          var payment = {
            payment_fields: oper_sett.payment_fields,
            api_get_payment_link: oper_sett.api_get_payment_link,
            api_payment_link_status: oper_sett.api_payment_link_status
          }
        } else {
          var payment = payment_details
        }
        var payment_id = '';
        if (query.razorpay_invoice_id) {
          payment_id = query.razorpay_invoice_id;
        } else {
          payment_id = query.razorpay_payment_id
          query.razorpay_invoice_id = query.razorpay_payment_link_id;
        }
        Razorpay.isPaymentSuccess(payment_id, payment, (data) => {
          if (data && !isEmpty(data) && data.status == 'paid') {
            Transaction.update({
              status: 'Approved'
            }, {
              where: {
                retainer_invoice_id: query.razorpay_invoice_id
              }
            }).then(function (update_status) {
              Transaction.findOne({
                raw: true,
                where: {
                  retainer_invoice_id: query.razorpay_invoice_id
                }
              }).then(function (trans) {
                Org.findOne({
                  raw: true,
                  where: {
                    org_id: trans.org_id
                  }
                }).then(function (org) {
                  var file_name = 'Receipt.pdf';
                  transactionReceipt.create(file_name, org, trans, function (path) {
                    var subject = "Receipt from Skie"
                    var attach = [{
                      filename: file_name,
                      path: path.filename
                    }]
                    Mailer.sendMail(null, null, org.report_email, false, null, attach, subject, cb);

                    function cb(data) {
                      fs.unlinkSync(path.filename);
                      res.status(200).send("Credit added successfully")
                    }
                  });
                })
              })
            }, function (err) {
              res.status(500).send("There was a problem in adding the credit")
            })
          } else {
            res.status(404).send("Failed");
          }
        });
      }
    }, (err) => {
      return res.status(500).send({
        message: 'There was a problem in finding the org'
      });
    });
  });
})

router.put("/:transaction_id", function (req, res) {
  if (req.body.status == 'Approved') {
    Org.findOne({
      raw: true,
      where: {
        org_id: req.body.org_id
      }
    }).then(function (org) {
      var file_name = 'Receipt.pdf';
      var arr = []
      Transaction.findOne({
        where: {
          transaction_id: req.body.transaction_id
        }
      }).then(function (trans) {
        Org.findOne({
          raw: true,
          where: {
            org_id: trans.org_id
          }
        }).then(function (org) {
          transactionReceipt.create(file_name, org, trans, function (path) {
            var subject = 'Receipt from Skie'
            var attach = [{
              filename: file_name,
              path: path.filename
            }]
            Mailer.sendMail(null, null, org.report_email, false, null, attach, subject, cb);

            function cb(data) {
              fs.unlinkSync(path.filename);
            }
          });
        })
      })
    })
  }

  Transaction.update(req.body, {
    where: {
      transaction_id: req.params.transaction_id
    }
  }).then(function (update_status) {
    res.status(200).send("Credit added successfully")

  }, function (err) {
    res.status(500).send("There was a problem in adding the credit")
  })
})

router.post('/search', VerifyToken, function (req, res) {
  User.findOne({
    raw: true,
    where: {
      user_id: req.userId
    }
  }).then(function (user) {
    var term = req.body.term
    var input = '%' + term + '%'
    var obj = {
      [Op.or]: [{
        total_amount: term
      },
      {
        bundle: {
          [Op.like]: input
        }
      },
      {
        payment_method: {
          [Op.like]: input
        }
      },
      {
        reference_number: {
          [Op.like]: input
        }
      },
      {
        status: {
          [Op.like]: input
        }
      },
      {
        org_name: {
          [Op.like]: input
        }
      }
      ]
    }
    obj['type'] = 'Credit'
    if ((user.roles.indexOf('RESELLER') > -1) || (user.roles.indexOf('HEPI_RESELLER') > -1)) {
      obj["reseller_org_id"] = user.reseller_org_id
    } else if ((user.roles.indexOf('OPERATOR') > -1) || (user.roles.indexOf('HEPI_OPERATOR') > -1)) {
      obj["org_id"] = user.org_id
    }
    var limit = req.body.limit;
    var off = (req.body.offset == 0) ? 0 : (req.body.offset - 1) * limit
    const page = parseInt(req.body.offset);
    const pageSize = req.body.limit;
    Transaction.findAndCountAll({
      where: obj,
      limit: Number(limit),
      offset: Number(off),
      order: [
        ['createdAt', 'DESC']
      ]
    }).then(function (credit) {
      var roundoff = Math.round(credit.count / limit);
      var page_list = credit.count / limit;
      if (roundoff < page_list) {
        page_list = roundoff + 1;
      } else {
        page_list = roundoff;
      }
      credit.count = page_list;
      res.status(200).send(credit)
    }, function (err) {
      res.status(500).send("Problem in finding Subscription");
    })
  })
})

router.post("/free/credit", function (req, res) {
  Transaction.create(req.body).then(function (create_free_credit) {
    res.status(200).send(create_free_credit)
  }, function (err) {
    res.status(500).send(err)
  })
})


router.get("/previousmonth/:org_id", function (req, res) {
  var date = new Date();
  var previous_month_start_date = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  var current_month_start_date = new Date(date.getFullYear(), date.getMonth(), 1);
  var obj = {
    time_stamp: { [Op.between]: [previous_month_start_date, current_month_start_date] },
    status: 'Approved',
    org_id: req.params.org_id
  }
  creditCalculation.Calculate(obj, function (data) {
    res.status(200).send(data);
  })
})



module.exports = router;
