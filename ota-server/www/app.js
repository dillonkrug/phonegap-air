document.addEventListener('deviceReady', function() {
	var metaInfo = '{{environment}} app',
		metaInfoNode = document.createTextNode(metaInfo);
	document.getElementById('loading').className = 'hidden';
	document.getElementById('loaded').className = '';
	document.getElementById('meta').appendChild(metaInfoNode);
}, false);

window.shouldAllowOTADevTools = function() {
	return true;
};