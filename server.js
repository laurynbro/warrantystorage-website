var application_root = __dirname,
    express = require("express"),
    path = require("path"),
   	mysql = require('mysql'),
   	crypto = require('crypto'), hmac, signature;

var auth_tokens = ["aCjRr9PgyMh62huDb6PrktZU"];

var app = express();

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

	

	var query = connection.query('SELECT * FROM webuser WHERE Uid=? AND Pwd=?',[req.body.username, req.body.password], function(err, rows) {
  		if (err || rows.length == 0){
  			return res.send({status:500, message: "The username or password was incorrect"});
  		}
  		res.send({token:rows[0].Sno, secret:rows[0].Sno.toString().hash()});

	});
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
		ProductName: req.body.manufacturer, 
		PurchaseDate: req.body.purchase_date, 
		WarrantyEndingDate: req.body.warranty_end_date, 
		SerialNumber: req.body.serial, 
		ModelNumber: req.body.model, 
		RegisterManufacturer: req.body.registered, 
		MaintenanceDate: req.body.maintenance_date, 
		MaintenancePeriod: req.body.maintenance_period, 
		RequiredRoutineMaintenance: req.body.maintenance_required, 
		VendorName: req.body.vendor, 
		Price: req.body.price, 
		Notes: req.body.notes,
		ADDateTime: new Date().toMySQL(),
		UpDateTime: new Date().toMySQL(),
		AddedBy: req.headers["token"],
		UpdateBy: req.headers["token"],
		Active: "Yes",
		Del: 0
	};

	connection.query('INSERT INTO warranty SET ?', post, function(err, result) {
		if (err || result.length == 0){
			console.log(err);
			return res.send({status:500, message: "Unable to save your warranty. Please try again later."});
		}
		connection.query('UPDATE warranty SET WarrantyCode = ? WHERE Sno=?', ["W" + "0".repeat(7 - result.insertId.toString().length) + result.insertId, result.insertId]);

		res.send({id: result.insertId});
	  
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



// Launch server

app.listen(4242);