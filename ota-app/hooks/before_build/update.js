#!/usr/bin/env node

var Promise = require('bluebird'),
	_ = require('lodash'),
	fs = Promise.promisifyAll(require('fs')),
	url = require('url'),
	path = require('path'),
	request = Promise.promisify(require('request')),
	crypto = require('crypto'),
	rootDir = process.argv[2],
	wwwDir = path.join(rootDir, 'www'),
	constantsFile = path.join(rootDir, 'platforms/ios/OTAApplication/Classes/Constants.m'),
	cacheDirectory = path.join(rootDir, 'platforms/ios/OTAApplication/Resources/cache');

function escapeRegExp(string) {
    return string.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1');
}
/**
 * These helper functions are direct ports of their objective-c counterparts
 */


function fixPrefix(input, prefix) {
	var re = new RegExp('(\'|"|\\()/' + escapeRegExp(prefix) + '/', 'g');
	return input.replace(re, '$1' + prefix + '/');
}

function shouldFixPrefix(fileName) {
	return /\.(js|css)$/.test(fileName) || fileName.indexOf('/js/') > -1 || fileName.indexOf('/css/') > -1;
}

function wrap (field, fn) {
	return function (data) {
		console.log('wrapped', field, fn.name, data);
		return fn(data).then(function (res) {
			console.log('... finished', field, fn.name);
			data[field] = res;
			return data;
		});
	};
}

function loadConstants() {
	return fs.readFileAsync(constantsFile, 'UTF8').
		then(function (data) {
			// console.log('file data is', data);
			var prodURL = data.match(/NSString\s+\*const\s+ProductionURL\s+=\s+@"(.*)";/),
				manifestPath = data.match(/NSString\s+\*const\s+ManifestPath\s+=\s+@"(.*)";/),
				absPathReplacements = data.match(/NSString\s+\*const\s+AbsolutePathsToReplace\s+=\s+@"(.*)";/);

			if (!prodURL) {
				throw new Error('Could not read ProductionURL from Constants.m');
			}

			if (!manifestPath) {
				throw new Error('Could not read ManifestPath from Constants.m');
			}

			if (!absPathReplacements) {
				absPathReplacements = [];
			} else {
				absPathReplacements = absPathReplacements[1].split(',');
			}
			return {
				prodURL: prodURL[1],
				manifestPath: manifestPath[1],
				absPathReplacements: absPathReplacements
			};
		});
}

function loadManifest(data) {
	return request({
			url: url.resolve(data.constants.prodURL, data.constants.manifestPath),
			json: true
		}).
		spread(function (res, manifest) {
			if (res.statusCode !== 200) {
				throw new Error('Failed to load manifest from url:', data.constants.prodURL, data.constants.manifestPath);
			}
			return manifest;
		});
}

function loadFiles (data) {
	var tasks = _.values(data.manifest.files),
		baseURL = data.constants.prodURL,
		pathReplacements = data.constants.absPathReplacements;

	_.each(data.manifest.assets, function (url) {
		var cacheURL = url.replace(/^.*:\/\//, ''),
			cacheKey = crypto.createHash('md5').update(cacheURL, 'UTF8').digest('hex').toUpperCase();

		tasks.push({
			source: url,
			destination: path.join(cacheDirectory, cacheKey + '.persist'),
			checksum: null, // Skip the check
			isAsset: true
		});
	});
	return Promise.map(tasks, function (file) {
		return request({
			url: file.isAsset ? file.source : url.resolve(baseURL, file.source),
			encoding: null // Force data to be a buffer, otherwise checksums won't match up
		}).spread(function (resp, data) {
			if (resp.statusCode !== 200) {
				throw new Error('Error fetching ' + url.resolve(baseURL, file.source) + '');
			}

			
			if (file.checksum){
				var resHash = crypto.createHash('md5').update(data).digest('hex');
				if (resHash !== file.checksum) {
					throw new Error('Hash for file ' + file.source + ' "' + resHash + '"doesn\'t match manifest hash "' + file.checksum + '"');
				}
			}

			// Absolute to relative path replacement logic
			if (shouldFixPrefix(file.source)) {
				data = data.toString();

				for (var i = 0, ii = pathReplacements.length; i < ii; ++i) {
					data = fixPrefix(data, pathReplacements[i]);
				}

				data = new Buffer(data);
			}
			return {
				destination: path.join(wwwDir, file.destination),
				data: data
			};

		});
	}, {
		concurrency: 5
	});
}

function saveFile (file) {
	return fs.writeFileAsync(file.destination, file.data);
}

function exec () {
	return Promise.resolve({}).
		then(wrap('constants', loadConstants)).
		then(wrap('manifest', loadManifest)).
		then(wrap('files', loadFiles)).
		then(function (data) {
			return Promise.each(data.files, saveFile);
		}).
		then(function () {
			process.exit(0);
		}).
		catch(function (err) {
			console.log('BUILD SCRIPT FAILED');
			console.error(err);
			console.error(err.stack);
			process.exit(1);
		});
}

exec();
