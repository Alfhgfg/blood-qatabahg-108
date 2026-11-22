package org.alnasr.bloodqatabah;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;

/**
 * Main Activity for Blood Donation App (Qaatabah).
 * Handles cold launches and background resumes from external notification clicks,
 * extracting the target blood requestId and triggering navigation inside the app.
 */
public class MainActivity extends BridgeActivity {
    private static final String TAG = "BloodQatabahApp";
    public static String pendingNotificationRequestId = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SafePushNotificationsPlugin.class);
        registerPlugin(AppUpdatePlugin.class);
        MainApplication.initializeFirebase(this);
        super.onCreate(savedInstanceState);
        handleNotificationIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleNotificationIntent(intent);
    }

    private void handleNotificationIntent(Intent intent) {
        if (intent == null) return;
        Bundle extras = intent.getExtras();

        String requestId = null;
        if (extras != null) {
            requestId = extras.getString("requestId");
        }

        if (requestId == null || requestId.isEmpty()) {
            Uri data = intent.getData();
            if (data != null) {
                requestId = data.getQueryParameter("openRequest");
            }
        }

        if (requestId != null && !requestId.isEmpty()) {
            pendingNotificationRequestId = requestId;
            final String finalReqId = requestId;
            Log.i(TAG, "Notification tapped with target requestId: " + finalReqId);

            // Execute in WebView once ready
            getWindow().getDecorView().postDelayed(() -> {
                try {
                    if (getBridge() != null && getBridge().getWebView() != null) {
                        String js = "(function(){"
                            + "window.dispatchEvent(new CustomEvent('OPEN_REQUEST_NOTIFICATION', { detail: { requestId: '" + finalReqId + "' } }));"
                            + "try { const u = new URL(window.location.href); u.searchParams.set('openRequest', '" + finalReqId + "'); window.history.pushState({}, '', u.toString()); } catch(e){}"
                            + "})();";
                        getBridge().getWebView().evaluateJavascript(js, null);
                        Log.i(TAG, "Dispatched OPEN_REQUEST_NOTIFICATION to WebView for requestId: " + finalReqId);
                    }
                } catch (Throwable t) {
                    Log.w(TAG, "Error evaluating notification tap JS: " + t.getMessage());
                }
            }, 1200);
        }
    }
}
