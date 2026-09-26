import test from 'node:test';
import assert from 'node:assert/strict';
import {CONSENT_MAX_AGE,DISCLAIMER_VERSION,consentCookie,hasConsent,consentDisplay} from '../src/consent.ts';
test('consent cookie is host-only, versioned and secure on HTTPS, separate from development',()=>{
 const cookie=consentCookie(true);
 assert.ok(cookie.startsWith('__Host-shikob.net.annum-aequitas-consent='+DISCLAIMER_VERSION));
 assert.ok(cookie.includes('; Secure'));assert.ok(cookie.includes('; SameSite=Lax'));assert.ok(cookie.includes('; Path=/'));assert.ok(cookie.includes('Max-Age='+CONSENT_MAX_AGE));assert.ok(!cookie.includes('Domain='));
 assert.ok(hasConsent('other=x; '+cookie.split(';')[0],true));
 assert.equal(hasConsent(cookie.replace(DISCLAIMER_VERSION,'old'),true),false);
 assert.equal(hasConsent('',true),false);
 assert.equal(hasConsent(consentCookie(false),true),false);
 assert.equal(consentCookie(false).includes('; Secure'),false);
});
test('first consent is unchecked and disabled; revisit permits returning without accepting again',()=>{
 const first=consentDisplay('en',false,false);
 assert.ok(first.includes('id="consent-accept" class="button primary" disabled'));
 assert.ok(!first.includes(' checked'));assert.ok(!first.includes('id="consent-back"'));
 assert.ok(consentDisplay('ja',true,true).includes('id="consent-back"'));
});
