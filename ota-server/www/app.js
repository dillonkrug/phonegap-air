(function (window, document) {

document.addEventListener('deviceReady', function () {
	var metaInfo = '{{environment}} app',
		metaInfoNode = document.createTextNode(metaInfo);
	document.getElementById('loading').className = 'hidden';
	document.getElementById('loaded').className = '';
	document.getElementById('meta').appendChild(metaInfoNode);
}, false);

function shouldAllowOTADevTools () {
	return true;	
}

window.shouldAllowOTADevTools = shouldAllowOTADevTools;

}(window, document));

