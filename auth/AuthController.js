var express       = require('express'),
    router        = express.Router(),
    bodyParser    = require('body-parser'),
    editJsonFile  = require('edit-json-file'),
    fileUpload     = require('express-fileupload'),
    jwt           = require('jsonwebtoken'),
    bcrypt        = require('bcryptjs'),
    exec          = require('child_process').exec,
    fs            = require('fs');
    
var VerifyToken = require(__root +__core+'modules/VerifyToken'),
    config      = require(__root +__core+'config'),
    Mailer      = require(__root+__core+'modules/Mailer'),
    conf        = editJsonFile(__root +"config.json");
    
router.use(bodyParser.json());
router.use(fileUpload());

var User            = __db_model.User,
    Org             = __db_model.Org,
    OperatorSetting = __db_model.OperatorSetting;


var remote_domain = conf.get('remote_domain'),
    remote_port   = conf.get('remote_port'),
    method_get    = 'GET',
    api           = '/api/auth'

router.post('/login', function(req, res) {
  var req_body=req.body,enable_reseller_bundle_creation = '';
  User.findOne({raw:true,where: {username: req_body.username,status:true}}).then(function(user){
    if((user == 0) || (user == null) || (!user)){
      return res.status(404).send('No user found.');
    }else{
      Org.findOne({raw:true,where: {org_id: user.org_id}}).then(function(org){
     	  if((org == 0) || (org == null) || (!org)){
       	  return res.status(404).send('No Org found.');
     	  }else{
          // check if the password is valid
         	var passwordIsValid = bcrypt.compareSync(req_body.password, user.password);
	        if (!passwordIsValid) return res.status(401).send({ auth: false, token: null });
          //if user is found and password is valid
          // create a token
      	  var user_id=user.user_id
          var token = jwt.sign({ id: user_id,org_id:user.org_id,user_status: user.status }, config.secret, {
      	    expiresIn: conf.get('expires_time') // expires in 15 mins
       	  });
          //return the information including token as JSON
      		if((org.org_type == 'RESELLER'||'OPERATOR'||'HEPI_OPERATOR'||'HEPI_RESELLER') && ((user.roles == 'OPERATOR') || (user.roles == 'RESELLER') || (user.roles == 'HEPI_RESELLER') || (user.roles == 'HEPI_OPERATOR'))){
      			OperatorSetting.findOne({raw:true,where:{org_id:org.org_id}}).then(function(oper){
				 if(!oper){
					return res.status(500).send('No Operator Setting found in this user')
				 }else{
      				 	enable_reseller_bundle_creation = oper.enable_reseller_bundle_creation;
	               			res.status(200).send({ auth: true, token: token, orgId:user.org_id, userId:user_id, reseller_id:user.reseller_org_id, expireMin: conf.get('expires_time'), roles:user.roles, first_name:user.first_name, last_name:user.last_name, ad_provision: org.ad_provision,allowed_app:org.allowed_app, enable_reseller_bundle_creation:enable_reseller_bundle_creation,provider_type:org.provider_type});
				 }
      			})
      		}else{
              	 	 res.status(200).send({ auth: true, token: token, orgId:user.org_id, userId:user_id, reseller_id:user.reseller_org_id, expireMin: conf.get('expires_time'), roles:user.roles, first_name:user.first_name, last_name:user.last_name, ad_provision: org.ad_provision,allowed_app:org.allowed_app});
      		}
       	}
      },function(err){
        return res.status(500).send('There was a problem in finding the org information');  
      })
    }
  },function(err){
    return res.status(500).send('There was a problem in finding the user');
  });
});

router.get('/logout', function(req, res) {
  res.status(200).send({ auth: false, token: null });
});

router.post('/token', VerifyToken, function(req, res) {  
  var req_user_id=req.userId
  User.findOne({raw:true,where:{user_id:req_user_id}}).then(function(user){
      var token = jwt.sign({ id: user.req_user_id, user_status: user.status }, config.secret, {
        expiresIn: conf.get('expires_time') // expires in 15 mins
      });
      res.status(200).send({ auth: true, token: token, userId:req_user_id, expireMin: conf.get('expires_time'),roles:user.roles, first_name:user.first_name, last_name:user.last_name });      
  },function(err){
    res.status(500).send("There was a problem in finding the user")
  })
});

router.get('/', function(req, res) {
  var json = conf.get('')
  res.status(200).send({ address:json.address, phone:json.phone, visit:json.visit });
});

router.post('/kyc', function(req, res) {
  var img_path = '/etc/ec/skie_kyc'
  var mobile_logo = img_path+'/'+'mobile_logo.png';
  var tv_logo = img_path+'/'+'tv_logo.png';
  var playstore_logo = img_path+'/'+'playstore_logo.png';
  var brand_logo = img_path+'/'+'brand_logo.png';
  exec("mkdir -p "+img_path,function(err,stdout,stderr){
    if(!err){
      fs.writeFileSync(mobile_logo,req.files.mobile_logo.data,'binary')
      fs.writeFileSync(tv_logo,req.files.tv_logo.data,'binary')
      fs.writeFileSync(playstore_logo,req.files.playstore_logo.data,'binary') 
      fs.writeFileSync(brand_logo,req.files.brand_logo.data,'binary') 

      var subject = 'KYC Details';
      var obj = {
        'org_name'         :'Organization Name',
        'city'             : 'City',
        'state'            : 'State',
        'pincode'          : 'Pincode',
        'technical_email'  : 'Technical Email',
        'report_email'     : 'Report Email',
        'mobile_number'    : 'Mobile Number',
        'app_name'         : 'App Name',
        'package_name'     : 'Package Name',
        'sms_method'       : 'SMS Method',
        'sms_host'         : 'SMS Host',
        'sms_contact_key'  : 'SMS Contact Key',
        'sms_api_context'  : 'SMS Api Context',
        'message_template' : 'Message Template',
        'sender_id'        : 'Sender ID',
        'company_website'  : 'Company Website',
        'facebook_link'    : 'Facebook Link',
        'youtube_link'     : 'Youtube Link',
        'support_mail_id'  : 'Support Mail ID',
        'support_mobile_no': 'Support Mobile No'
      }
      let message = (
          'Hi,<br><br>'+
          'The KYC Details are; <br>'+
          '<table style="border-collapse: collapse;">' 
        )
      for(var i in req.body) {
        if(req.body[i].length>0){
          message += (
            '<tr>' +
            '<td style="border: 1px solid #333;">' + obj[i]+ '</td>' +
            '<td style="border: 1px solid #333;">' + req.body[i] + '</td>' +
            '</tr>'
          );
        }
      }
      var attach = [
      {filename:'Mobile Logo.png',path:mobile_logo},
      {filename:'TV Logo.png',path:tv_logo},
      {filename:'Playstore Logo.png',path:playstore_logo},
      {filename:'Brand Logo.png',path:brand_logo},
      ]
      Mailer.sendMail(null,null,conf.get('kyc_mail'),false,message,attach,subject,cb);
      function cb(data){
        res.status(200).send("KYC added successfully")
      }
    }
  })
});

module.exports = router;
