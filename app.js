var express = require('express');
var app 	= express();  
global.__root   	= __dirname + '/';
global.__core		=	'../cloud_ott_core_module/src/';
global.__db_model 	=	require(__core+'db/model');

app.get('/api', function (req, res) {
  res.status(200).send('API works.');
});

var AuthController = require(__root + 'auth/AuthController');
app.use('/api/auth', AuthController);

var UserController = require(__root + 'user/UserController');
app.use('/api/user', UserController);

var TransactionController=require(__root + 'transaction/TransactionController');
app.use('/api/transaction', TransactionController);

var SubscriptionController=require(__root + 'subscription/SubscriptionControllerNew');
app.use('/api/subscription', SubscriptionController);

var EMMController=require(__root + 'emm/EMMController');
app.use('/api/emm',EMMController);

var DashboardController = require(__root + 'dashboard/DashboardController');
app.use('/api/dashboard', DashboardController);

module.exports = app;
