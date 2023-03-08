var express = require('express'),
	router = express.Router(),
	bodyParser = require('body-parser'),
	VerifyToken = require(__root + __core + 'modules/VerifyToken'),
	editJsonFile = require('edit-json-file');

var EMM = __db_model.EMM;


function guid() {
	function s4() {
		return Math.floor((1 + Math.random()) * 0x10000)
			.toString(16)
			.substring(1);
	}
	return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}


router.use(bodyParser.json({ limit: '50mb', extended: true }));

router.get("/", VerifyToken, function (req, res) {
	EMM.findAll({ raw: true, order: [['createdAt', 'DESC']] }).then(function (emm) {
		res.status(200).send(emm);
	}, function (err) {
		if (err) return res.status(500).send("There was a problem finding the EMM Details");
	});
})

router.post('/' , VerifyToken, function (req, res) {
  var request = req.body;
   EMM.create(request).then(function(user){
      res.status(200).send("Inventory created successfully");
  },function(err){
    if(err && err.errors[0].message) { return res.status(500).send(err.errors[0].message)} //DUPLICATE ENTRY FOR UNIQUE FIELD
    res.status(500).send("Inventory creation failed");
  })
});

router.post('/bulk' , VerifyToken, function (req, res) {
  var request = req.body;
   EMM.bulkCreate(request).then(function(user){
      res.status(200).send("Inventory created successfully");
  },function(err){
    if(err && err.errors[0].message) { return res.status(500).send(err.errors[0].message)} //DUPLICATE ENTRY FOR UNIQUE FIELD
    res.status(500).send("Inventory creation failed");
  })
});


// delete
router.delete('/:unique_id',VerifyToken, function(req,res){
	EMM.destroy({raw:true,where:{unique_id:req.params.unique_id}})
	   .then(function(deleteEmm){
	res.status(200).send('Inventory deleted successfully!');
    },function(err){
	  res.status(500).send('There was a problem in deleting Inventory!');
    })
})


module.exports = router;
