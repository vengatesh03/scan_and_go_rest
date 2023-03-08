var express   = require('express'),
    router    = express.Router(),
    bodyParser= require('body-parser'),
    bcrypt    = require('bcryptjs');
var VerifyToken = require(__root +__core+'modules/VerifyToken');  

router.use(bodyParser.json());

var User  = __db_model.User;

function guid() {
    function s4() {
      return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
    }
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}

// CREATES A NEW USER
router.post('/' , VerifyToken, function (req, res) {
  var request = req.body;
  request.password = bcrypt.hashSync(request.password, 8);
   User.create(request).then(function(user){
      res.status(200).send("User created successfully");
  },function(err){
    if(err && err.errors[0].message) { return res.status(500).send(err.errors[0].message)} //DUPLICATE ENTRY FOR UNIQUE FIELD
    res.status(500).send("User creation failed");
  })
});

// RETURNS ALL THE USERS IN THE DATABASE
router.get('/', VerifyToken, function (req, res) {
  User.findOne({raw:true,where:{user_id:req.userId}}).then(function(user_info){
    var obj={};
    if(user_info.roles.indexOf('RESELLER')>-1){
      obj["reseller_org_id"]=user_info.reseller_org_id
    }
    User.findAll({raw:true,where:obj,order:[['createdAt','DESC']]}).then(function(user){
      res.status(200).send(user)
    },function(err){
      res.status(500).send("There was a problem in finding the Users")
    })
  })
});

// GETS A SINGLE USER FROM THE DATABASE
router.get('/:user_id', VerifyToken,  function (req, res) {
  User.findOne({raw:true,where:{user_id:req.params.user_id}}).then(function(user){
    if (!user){return res.status(404).send("No user found.");}
    user.password="";
    res.status(200).send(user);
  },function(err){
    res.status(500).send("There was a problem in finding the user.");
  });
});

//FOR UPDATION USE ONLY _ID
router.put('/:user_id',  VerifyToken,  function (req, res) {
  var req_body=req.body
  var password=req_body.password
  var status  =req_body.status
  function execute(){
      if(password){
        req_body.password = bcrypt.hashSync(password, 8);
      }else{
        delete password;
      }
      User.update(req.body,{where: {user_id:req.params.user_id}}).then(function(rowsUpdated) {
        if(rowsUpdated == 0) {res.status(500).send("User updation Failed")}
        if(rowsUpdated > 0) {res.status(200).send("User updated successfully")}
      });
  }

  if((req_body.user_id == req.userId) && (status == false)){
      res.status(500).send("Unable to disable the self account");
  }else{
      execute();
  }
});

module.exports = router;
