// Saves options to chrome.storage.sync
const STOREKEY = 'caster_prefs';
var _prefs = {};

function retrieve_options(mtype) {
	if (!(mtype)) { mtype = 'get'; }
	//console.log('retrieve_options');
	chrome.runtime.sendMessage({q: mtype}, function(r) {
		_prefs = r.answer;
		populateDisplay();
	});
}

function save_options() {
	//console.log('save_options');
	chrome.runtime.sendMessage({q: 'save', p: _prefs}, function(r) {
		//console.log(r);
	});
	self.close();
}

function cancel_options() {
	//console.log('cancel_options');
	self.close();
}

function reset_options() {
	//console.log('reset_options');
	retrieve_options('defaults');
	document.getElementById('status').textContent = 'reset to defaults (not saved)';
}

function populateDisplay() {
	//console.log('populateDisplay');
	for (var k in _prefs) {
		//console.log(k);
		if (['dorelogin', 'dopopup'].indexOf(k) >= 0) {
			document.getElementById('val_' + k.toString()).checked  = _prefs[k];
		} else {
			document.getElementById('val_' + k.toString()).value = _prefs[k];
		}
		checkToggle();
	}
}

function saveDisplay() {
	document.getElementById('status').textContent = 'saved';
	for (var k in _prefs) {
		//console.log(k);
		//if (k == 'dorelogin') {
		if (['dorelogin', 'dopopup'].indexOf(k) >= 0) {
			_prefs[k] = document.getElementById('val_' + k.toString()).checked;
		} else {
			_prefs[k] = document.getElementById('val_' + k.toString()).value;
		}
	}
	//console.log(_prefs);
	save_options();
}

function checkToggle() {
	document.getElementById('val_loginurl').disabled = !(document.getElementById('val_dorelogin').checked);
	document.getElementById('val_relogtime').disabled = !(document.getElementById('val_dorelogin').checked);
	document.getElementById('val_alerttime').disabled = !(document.getElementById('val_dopopup').checked);
}

function onLoadOptions() {
	retrieve_options();
}

document.addEventListener('DOMContentLoaded', onLoadOptions);
document.getElementById('save').addEventListener('click', saveDisplay);
document.getElementById('reset').addEventListener('click', reset_options);
document.getElementById('cancel').addEventListener('click', cancel_options);
document.getElementById('val_dorelogin').addEventListener('change', checkToggle);
document.getElementById('val_dopopup').addEventListener('change', checkToggle);
