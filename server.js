var application_root = __dirname,
    express = require("express"),
    request = require('request'),
    path = require("path"),
   	mysql = require('mysql'),
   	moment = require('moment'),
   	fs = require('fs'),
   	crypto = require('crypto'), hmac, signature,
   	flow = require("flow");

var auth_tokens = ["aCjRr9PgyMh62huDb6PrktZU"];

var app = express();

var DOWNLOAD_PATH = __dirname + "/uploads/";


// Database

var connection = mysql.createConnection({
  host     : 'localhost',
  database : 'WarrantyUser',
  user     : 'WarrantyUser',
  password : 'Warrenty@123',
});

//Helper Methods
String.prototype.hash = function() {
	return crypto.createHmac('sha1', "tAuRBaAuB98ySEUyKmc5HT6P").update(this.toString()).digest("hex");
}

String.prototype.repeat = function( num )
{
    return new Array( num + 1 ).join( this );
}

//Simple method for padding numbers to two digits
function twoDigits(d) {
    if(0 <= d && d < 10) return "0" + d.toString();
    if(-10 < d && d < 0) return "-0" + (-1*d).toString();
    return d.toString();
}

Date.prototype.toMySQL = function(){
	return this.getUTCFullYear() + "-" + 
		twoDigits(1 + this.getUTCMonth()) + "-" + 
		twoDigits(this.getUTCDate()) + " " + 
		twoDigits(this.getUTCHours()) + ":" + 
		twoDigits(this.getUTCMinutes()) + ":" + 
		twoDigits(this.getUTCSeconds());
}

function ValidateToken (token){
	for (var i =0;i<auth_tokens.length;i++){
		if (token == auth_tokens[i]){
			return true;
		}
	}
	return false;
}




// Config

app.configure(function () {
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(path.join(application_root, "public")));
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.get('/api', function (req, res) {
	res.send({name: "Warranty Storate API", version: 1.0, status: 200});	

});

//Authentication
app.post("/api/authenticate", function (req, res) {

	if (!ValidateToken(req.body.auth_token)){
		return res.send({status:500, message: "The auth token provided was incorrect."});	
	}

	if (req.body.username == null || req.body.username == ""){
		return res.send({status: 500, message: "A username is required."});
	}
	if (req.body.password == null || req.body.password == ""){
		return res.send({status: 500, message: "A password is required."});
	}

	flow.exec(
		function(){
			request("http://www.warrantystorage.com/encode.php?value=" + req.body.password, this);
		},
		function(error, response, body){
			var query = connection.query('SELECT * FROM webuser WHERE Uid=? AND Pwd=?',[req.body.username, body], function(err, rows) {
		  		if (err || rows.length == 0){
		  			return res.send({status:500, message: "The username or password was incorrect."});
		  		}

		  		return res.send({token:rows[0].Sno, secret:rows[0].Sno.toString().hash(), name: rows[0].FirstName + " " + rows[0].LastName});

			});
		}
	)
	
});

//Plan Details
app.get("/api/plan", function (req, res){
	if (req.headers["secret"] != req.headers["token"].hash()){
		return res.send({status:500, message: "Your API secret was incorrect."});
	}

	flow.exec(
		function(){
			_PackageInfo(req.headers["token"], this);
		},
		function (package){
			return res.send({package: package});
		}
	)
});



//Warranties
app.get("/api/warranty", function (req, res) {

	if (req.headers["secret"] != req.headers["token"].hash()){
		return res.send({status:500, message: "Your API secret was incorrect."});
	}


	connection.query('SELECT * FROM warranty WHERE WebUserSno=?', [req.headers["token"]], function(err, rows) {
  		if (err || rows.length == 0){
  			return res.send({status:500, message: "No Warranties were found for this user."});
  		}
  		res.send(rows);

	});
});


app.get("/api/warranty/:id", function (req, res) {

	if (req.headers["secret"] != req.headers["token"].hash()){
		return res.send({status:500, message: "Your API secret was incorrect."});
	}


	connection.query('SELECT * FROM warranty WHERE Sno=? AND WebUserSno=?',[req.params.id, req.headers["token"]], function(err, rows) {
  		if (err || rows.length == 0){
  			return res.send({status:500, message: "The specific warranty could not be found."});
  		}
  		res.send(rows[0]);

	});
});

app.post("/api/warranty", function (req, res) {

	if (req.headers["secret"] != req.headers["token"].hash()){
		return res.send({status:500, message: "Your API secret was incorrect."});
	}
	
	var post = {
		WarrantyCode: "",
		WebUserSno: req.headers["token"],
		WarrantySlipScanCopy: "",
		CategorySno: req.body.category, 
		ProductName: req.body.product_name, 
		PurchaseDate: new Date(req.body.purchase_date).toMySQL(), 
		WarrantyEndingDate: new Date(req.body.warranty_end_date).toMySQL(), 
		SerialNumber: req.body.serial, 
		ModelNumber: req.body.model, 
		RegisterManufacturer: req.body.registered, 
		MaintenanceDate: (req.body.maintenance_date != "") ? new Date(req.body.maintenance_date).toMySQL() : new Date("12-12-2080").toMySQL(), 
		MaintenancePeriod: req.body.maintenance_period, 
		RequiredRoutineMaintenance: req.body.maintenance_required, 
		VendorName: req.body.vendor, 
		Price: req.body.price, 
		Notes: "This warranty has no notes.",
		ADDateTime: new Date().toMySQL(),
		UpDateTime: new Date().toMySQL(),
		AddedBy: req.headers["token"],
		UpdateBy: req.headers["token"],
		Active: "Yes",
		Del: 0
	};

	flow.exec(
		function(){
			_PackageInfo(req.headers["token"], this);
		},
		function (package){
			if (package.used >= package.available){
				return res.send({status:500, message: "You have reached your Warranty Limit. Please consider upgrading your plan."});	
			}
			connection.query('INSERT INTO warranty SET ?', post, function(err, result) {
			if (err || result.length == 0){
				console.log(err);
				return res.send({status:500, message: "Unable to save your warranty. Please try again later."});
			}
			var wId = "W" + "0".repeat(7 - result.insertId.toString().length) + result.insertId;
			connection.query('UPDATE warranty SET WarrantyCode = ? WHERE Sno=?', [wId, result.insertId]);
			if (req.files!= null){
				var extension = req.files.image.name.split(".")[1];
				fs.readFile(req.files.image.path, function (err, data) {
			  		var newPath = DOWNLOAD_PATH + "WarrantySlipScanCopy_" + result.insertId + "." + extension;
			  		fs.writeFileSync(newPath, data);
			  		connection.query('UPDATE warranty SET WarrantySlipScanCopy = ? WHERE Sno=?', ["WarrantySlipScanCopy_" + result.insertId + "." + extension, result.insertId]);
				});
			}
				
			res.send({id: result.insertId});
		}
	)
	  
	});

});

app.get("/api/category", function (req, res) {

	if (req.headers["secret"] != req.headers["token"].hash()){
		return res.send({status:500, message: "Your API secret was incorrect."});
	}


	connection.query('SELECT * FROM category WHERE Active="Yes"', function(err, rows) {
  		if (err || rows.length == 0){
  			return res.send({status:500, message: "Unable to get categories. Please try again later."});
  		}
  		res.send(rows);

	});
});


function _PackageInfo(id, cb){

	var packageId;
	var date = new Date();
	var firstDay = new Date(date.getFullYear(), date.getMonth() - 1, 1);
	var firstOfYear = new Date(date.getFullYear(), 0, 1);
	var total;

	flow.exec(
		function(){
			connection.query('SELECT * FROM webuser WHERE Sno=?',[id], this);	
		},
		function(err, rows){
			packageId = rows[0].PackageSno;
			if (packageId > 1){
				connection.query('SELECT Sno from warranty WHERE WebUserSno = ? and ADDateTime BETWEEN ? and ?', [id, firstDay.toMySQL(), date.toMySQL()], this);
			}
			else {
				connection.query('SELECT Sno from warranty WHERE WebUserSno = ? and ADDateTime BETWEEN ? and ?', [id, firstOfYear.toMySQL(), date.toMySQL()], this);
			}
		},
		function (err,rows){
			switch (packageId){
				case 1:
					total = {used: rows.length, available: 2};
					break;
				case 2:
					total = {used: rows.length, available: 20};
					break;
				case 3:
					total = {used: rows.length, available: 100};
					break;
				case 4:
					total = {used: rows.length, available: 300};

			}
			cb(total);
		}
	)

	

}



// Launch server

app.listen(4242);