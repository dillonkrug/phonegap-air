/**
 * A simple server that serves the contents of the www folder
 */
var _ = require('lodash'),
	Promise = require('bluebird'),
	fs = Promise.promisifyAll(require('fs')),
	path = require('path'),
	crypto = require('crypto'),
	wwwDir = path.join(__dirname, 'www'),
	appPath = path.join(wwwDir, 'app.js'),
	express = require('express'),
	app = express();

// Replace app.js placeholder so the apps know where they pulled from

var cachedManifest = false,
	cachedAppJs = false;

function getAppJs(asBuffer) {
	cachedAppJs = fs.readFileAsync(appPath, 'UTF8').
		then(function (data) {
			data = data.replace(/\{\{environment\}\}/g, process.env.NODE_ENV);
			return asBuffer ? new Buffer(data) : data;
		});

	return cachedAppJs;

}

function buildManifest () {
	console.log('Building manifest');
	cachedManifest = fs.readdirAsync(wwwDir).
		map(function (file) {
			if (file === 'app.js') {
				return Promise.props({
					name: 'app.js',
					data: getAppJs(true)
				});
			}
			var fullPath = path.join(wwwDir, file);
			return fs.readFileAsync(fullPath).
				then(function (data) {
					return {
						name: file,
						data: data
					};
				});
		}).
		then(function (files) {
			return {
				files: _.reduce(files, function(out, file) {
					out[file.name] = {
						checksum: crypto.createHash('md5').update(file.data).digest('hex'),
						destination: file.name,
						source: '/' + file.name
					};
					return out;
				}, {}),
				assets: []
			};
		});
	return cachedManifest;
}


function serveManifest (req, res) {
	console.log('sending manifest');
	Promise.resolve().
		then(function () {
			return cachedManifest || buildManifest();
		}).
		then(function (manifest) {
			manifest.message = 'The version updates every second when not in production';

			// Pin the production version so that we can test the redundant update logic
			if (process.env.NODE_ENV === 'production') {
				manifest.version = '1.1.0';
			} else {
				manifest.version = '1.1.' + Math.round(Date.now() / 1000);
			}

			res.send(manifest);
		});
}

function serveAppJs (req, res) {
	Promise.resolve().
		then(function () {
			return cachedAppJs || getAppJs();
		}).
		then(function(content) {
			res.set('Content-Type', 'application/javascript');
			res.send(content);
		});

}
app.use(function (req, res, next) {
	console.log(req.originalUrl);
	next();
});

app.get('/manifest.json', serveManifest);
app.get('/app.js', serveAppJs);

app.use(express.static(wwwDir));

app.listen(process.env.PORT || 8000, function (err) {
	if (err) {
		console.error('Error starting server');
		console.error(err);
	} else {
		console.log('Server listing on port', process.env.PORT || 8000);
	}
});
