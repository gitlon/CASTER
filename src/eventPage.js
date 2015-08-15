
var _expTime = new Date(0);
var _msg = '';
var _mins = -1;
var _rtab;
var _relogrole = '';
var _rlistener;
var _clistener;
var _crescan;
var _doDebug = false;
var _prevInfo = {};

var _defaultprefs = {
	relogtime: 2, // minutes
	dorelogin: true,
	dopopup: true,
	loginurl: 'https://YOURADFS.com/adfs/ls/idpinitiatedsignon?loginToRp=urn:amazon:webservices/',
	alerttime: 5, // minutes
	warntime: 10, // minutes
	dangerzone: 5 // minutes
};

var _prefs = {};

const ALARMNAME = 'casterAlarm';
const NOTIFYNAME = 'casterNotify';
const STOREKEY = 'caster_prefs';

if (!chrome.cookies) {
	chrome.cookies = chrome.experimental.cookies;
}

// Check whether new version is installed
chrome.runtime.onInstalled.addListener(function(details){
	writeLog("Installed");
  if(details.reason == "install") {
  	writeLog("This is a first install!");
  } else if (details.reason == "update") {
  	var thisVersion = chrome.runtime.getManifest().version;
    writeLog("Updated from " + details.previousVersion + " to " + thisVersion + "!");
  }
	chrome.runtime.openOptionsPage();
});

chrome.cookies.onChanged.addListener(cookieListener);
chrome.alarms.onAlarm.addListener(alarmHandling);
chrome.notifications.onButtonClicked.addListener(notificationHandling);
chrome.browserAction.onClicked.addListener(popupClickHandling);
chrome.runtime.onMessage.addListener(optionQueryHandling);
chrome.omnibox.onInputStarted.addListener(onInputStartedHandling);
chrome.omnibox.onInputChanged.addListener(onInputChangedHandling);
chrome.omnibox.onInputEntered.addListener(onInputEnteredHandling);
chrome.tabs.onUpdated.addListener(doPostBack);

function writeLog() {
	if (_doDebug) {
		var a = [];
		for (i = 0; i < arguments.length; i++) {
			a.push(arguments[i]);
		}
		console.log.apply(console, a); // write out all arguments as an array
	}
}

function onInputStartedHandling() {
	chrome.omnibox.setDefaultSuggestion({description: 'Press enter to action'});
}

function onInputChangedHandling(typed, reply) {
	var r = [];
	switch (true) {
		case ('reauth'.startsWith(typed) && typed.length > 0): {
			r.push({content: 'reauth', description: '[reauth] try to login again with the same user and role'});
			break;
		}
		case ('options'.startsWith(typed) && typed.length > 0): {
			r.push({content: 'options', description: '[options] show the options page'});
			break;
		}
		case (typed == ' ' || typed.length == 0): {
			r.push({content: ' ', description: '[blank] show the details notification'});
			break;
		}
		default: { break; }
	}
	reply(r);
}

function onInputEnteredHandling(typed, dispo) {
	writeLog('onInputEnteredHandling', typed);
	switch (true) {
		case (typed == ' ' || typed.length == 0): { popupClickHandling(dispo); break; }
		case (typed == 'reauth'): { doReLogin(); break; }
		case (typed == 'options'): { chrome.runtime.openOptionsPage(); break; }
		default: { break; }
	}
}


function optionQueryHandling(msg, from, callback) {
	writeLog('optionQueryHandling', msg, from);
	var a = {answer: ''};
	switch (true) {
		case (msg.q == 'defaults'): { a.answer = _defaultprefs; break; }
		case (msg.q == 'save'): {
			_prefs = msg.p;
			setUserPrefs();
			alarmHandling('from queryHandling');
			a.answer = 'ok';
			break;
		}
		case (msg.q == 'get'): { a.answer = _prefs; break; }
		default: { break; }
	}
	writeLog(a);
   callback(a);
};

function getUserPrefs() {
	writeLog('getUserPrefs');
	chrome.storage.sync.get(STOREKEY, function(items) {
		if (items[STOREKEY]) {
			writeLog('got from storage');
			_prefs = items[STOREKEY];
			if (!("dopopup" in _prefs)) { // 1.0.8 to 1.0.9 migration
				writeLog('prefs migration');
				_prefs.dopopup = _defaultprefs.dopoup;
			}
			writeLog(_prefs);
		} else {
			writeLog('got from defaults');
			_prefs = _defaultprefs;
			setUserPrefs();
			evalExpiryTime();
		}
	});
}

function setUserPrefs() {
	writeLog('setUserPrefs');
	var s = {'caster_prefs': _prefs}; // cant use STOREKEY here
	chrome.storage.sync.set(s);
}

function doReLogin() {
	writeLog('doReLogin');
	_rtab = null;
	_relogrole = '';
	var p = {
		type: 'progress',
		title: 'AWS Credential Expiry',
		message: 'Attempting relogin\nfor: ' + _prevInfo.user + ' as ' + _prevInfo.role + '\nvia: ' + _prefs.loginurl,
		isClickable: false,
		priority: 0,
		progress: 50,
		iconUrl: 'working.png'
	};
	chrome.notifications.clear(NOTIFYNAME);

	if (!(_prefs.dorelogin)) {
		writeLog('skipping relogin per user pref');
		p.message = 'skipping relogin per user preferences';
		p.progress = 0;
	}

	if (_prefs.dopopup) {
		chrome.notifications.create(NOTIFYNAME, p);
	} else {
		writeLog('skipping notification from doReLogin');
	}

	if (_prefs.dorelogin) {
		writeLog('trying to create login tab');
		_clistener = false;
		_rlistener = true;
		chrome.tabs.create({url: _prefs.loginurl, active: false}, function (t) {
			_rtab = t;
		});
	}
}

function doPostBack(tabid, change, tab) {
	writeLog(tabid, change, tab);
	if (_rlistener) {
		if (_rtab.id == tabid) {
			if (change.status == 'complete' && tab.url == 'https://signin.aws.amazon.com/saml' && (!(_relogrole))) {
				writeLog('doPostBack ready');
				if (!_prevInfo.userInfo) {
					writeLog('need to invoke evalAllCookies later');
				} else {
					_relogrole = _prevInfo.userInfo.arn.replace(':sts:', ':iam:').replace(':assumed-role/', ':role/');
					_relogrole = _relogrole.substring(0, _relogrole.lastIndexOf('/'));
					writeLog('_relogrole', _relogrole);
					chrome.tabs.executeScript(tabid,
						{code: 'document.getElementById("' + _relogrole + '").checked = true; document.getElementById("saml_form").submit();'}, function (n) {
							writeLog('posted');
						}
					);
				}
			}
			else if (change.status == 'complete') {
				if (_relogrole) {
					writeLog('doPostBack done');
					evalAllCookies();
					_rlistener = false;
					try {
						chrome.tabs.remove(tabid);
					} catch (err) {
						writeLog(err);
					}
					_clistener = true;
				} else {
					writeLog('invoking evalAllCookies');
					evalAllCookies();
				}
			}
		}
	}
}

function notificationHandling(id, button) {
	writeLog('notificationHandling', id, button);
	switch (true) {
		case (button == 0): { // Options
			chrome.runtime.openOptionsPage();
			break;
		}
		case (button == 1): { // Authenticate
			doReLogin();
			break;
		}
		default: { break; }
	}
}

function popupClickHandling(tab) {
	writeLog('popupClickHandling');
	chrome.notifications.clear(NOTIFYNAME);
	evalExpiryTime();
	writeLog('popupClickHandling calls doNotify with force');
	doNotify(true);
	doUserUpdates();
}

function alarmHandling(alarm) {
	writeLog('alarmHandling', alarm);
	evalExpiryTime();
	doUserUpdates();
}

function doNotify(force) {
	var mustDo = false;
	if (force === undefined) {
		writeLog('force was undefined');
  	// not passed
  } else {
		mustDo = force;
		writeLog('force was defined', force, mustDo);
	}

	if (_prefs.dopopup || mustDo) {
		writeLog('doNotify');
		var p = {
			type: 'progress',
			title: 'AWS Credential Expiry',
			message: _msg.replace('AWS SAML Credentials\n', ''),
			isClickable: true,
			buttons:  [
				{ title: 'Options', iconUrl: 'gear.png'},
				{ title: 'Authenticate', iconUrl: 'retry.png'}
			],
			priority: 0
		}

		if (_mins > 0) {
			p.iconUrl = 'notify_lock.png';
			p.progress = Math.round(100 * _mins / 60);
		} else {
			p.progress = 0;
			p.iconUrl = 'notify_unlock.png';
		}

		chrome.notifications.create(NOTIFYNAME, p);
	}
}

function evalExpiryTime() {
	writeLog('evalExpiryTime');
	var d = new Date();
	_mins = Math.round((_expTime - d) / 1000 / 60);
	if (!(_expTime)) {_mins = -1; }
	if (_mins <= 0) {
		writeLog('not logged in any more');
		_msg = 'AWS credentials expired';
		if (_prevInfo.role) { _msg += '\npreviously: ' + _prevInfo.user + ' as ' + _prevInfo.role ; }
	} else {
		_msg = 'AWS SAML Credentials';
		if (_prevInfo.role) { _msg += '\ncurrently: ' + _prevInfo.user + ' as ' + _prevInfo.role ; }
		_msg += '\nexpires: ' + _mins.toString() + ' min';
		if (_mins > 1) { _msg += 's'; }
	}
	writeLog(_msg);
}

function doUserUpdates() {
	writeLog('doUserUpdates');
	var c = '#008000';

  switch (true) {
	  case (_mins < _prefs.dangerzone): { c = '#FF0000'; break; }
		case (_mins < _prefs.warntime): {	c = '#FFD700'; break; }
		case (_mins < 0): {	c = '#000000'; break; }
	  default: {  break; }
	}

	chrome.browserAction.setTitle({title: _msg });
	var m = '-';
	if (_mins > 0) { m = _mins.toString(); }
	chrome.browserAction.setBadgeBackgroundColor({color: c});
	chrome.browserAction.setBadgeText({text: m});

	switch (true) {
		case (_mins <= 0): {
			chrome.notifications.clear(NOTIFYNAME);
			chrome.alarms.clear(ALARMNAME);
			writeLog('doUserUpdates calls doNotify without force to alert that time has expired');
			doNotify();
			break;
		}
		case (_mins <= _prefs.relogtime): {
			doReLogin();
			break;
		}
		case (_mins <= _prefs.alerttime): {
			writeLog('doUserUpdates calls doNotify without force to alert based on user prefs');
			doNotify();
			break;
		}
		default: {
			break; }
	}
}

 function evalThisCookie(c) {
	writeLog(c.name);
	if ((c.name == 'seance') && c.domain.endsWith('amazon.com')) {
		var t = new Date(0);
		t.setUTCSeconds((JSON.parse(decodeURIComponent(c.value))).exp / 1000);
		if (t > Date.now()) {
			if (t > _expTime) {
				_expTime = t;
				writeLog(c.domain + ', ' + c.name + ', ' + _expTime);
				chrome.alarms.create(ALARMNAME, {periodInMinutes:1});
				if (_relogrole) {
					_relogrole = null;
					popupClickHandling(null);
				}
			}
		}
	} else if ((c.name == 'aws-userInfo') && c.domain.endsWith('amazon.com')) {
		var oldInfo = _prevInfo.userInfo;
		_prevInfo.userInfo =  JSON.parse(decodeURIComponent(c.value));
		var rr = _prevInfo.userInfo.username.replace('assumed-role/', '').split('/');
		_prevInfo.role = rr[0];
		_prevInfo.user = rr[1].split('@')[0];
		writeLog(_prevInfo.userInfo, _prevInfo.role, _prevInfo.user);
		if (!(oldInfo)) {
			doUserUpdates();
		}
	}
}

function cookieListener(info) {
	if (_clistener) {
		if (info.cookie.domain.endsWith('amazon.com') && info.removed) {
			writeLog('AWS cookie removed, need to re-evaluate');
			evalAllCookies();
		} else {
			evalThisCookie(info.cookie);
		}
	}
}

function evalAllCookies() {
	if (_crescan) {
		_crescan = false;
		writeLog('evalAllCookies');
		chrome.cookies.getAll({}, function(c) {
			for (var i in c) {
				evalThisCookie(c[i]);
			}
			alarmHandling('from AllCookies');
			_crescan = true;
		});
	}
}

function onLoad() {
	getUserPrefs();
	_crescan = true;
	evalAllCookies();
	_clistener = true;
}

document.addEventListener('DOMContentLoaded', onLoad);
