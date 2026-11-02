package com.luymanager.nativeapp;

import android.app.Application;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.net.ConnectivityManager;
import android.net.Network;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class LuyApplication extends Application {
  static final String OFFLINE = "Connection unavailable. Entries are saved on this phone.";
  final ExecutorService worker = Executors.newSingleThreadExecutor();
  final ExecutorService network = Executors.newSingleThreadExecutor();
  private final java.util.concurrent.atomic.AtomicBoolean syncing =
      new java.util.concurrent.atomic.AtomicBoolean();
  volatile CloudClient cloud;
  volatile LedgerStore store;
  volatile String status = "Ready";
  /** True when the server refused our credentials, so retrying in the background is pointless. */
  volatile boolean blocked;
  /** True when signing in again would fix it. Entries stay on the phone either way. */
  volatile boolean reauth;
  /** Set by the visible screen so a background sync can refresh it. */
  volatile Runnable synced;

  @Override
  public void onCreate() {
    super.onCreate();
    try {
      cloud = new CloudClient(new SessionVault(this));
      if (cloud.signedIn()) store = new LedgerStore(this, cloud.owner());
    } catch (Exception e) {
      status = "Secure session unavailable. Sign in again.";
    }
    watchNetwork();
  }

  /** Upload waiting entries as soon as a network appears, without waiting for the job scheduler. */
  private void watchNetwork() {
    try {
      ConnectivityManager connectivity = getSystemService(ConnectivityManager.class);
      if (connectivity == null) return;
      connectivity.registerDefaultNetworkCallback(
          new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
              LedgerStore current = store;
              if (current == null || cloud == null || !cloud.signedIn() || blocked) return;
              if (current.pendingCount() > 0 || !status.equals("Up to date")) sync(synced);
            }
          });
    } catch (RuntimeException ignored) {
      // The job scheduler and the open app still retry.
    }
  }

  void schedule() {
    getSystemService(JobScheduler.class)
        .schedule(
            new JobInfo.Builder(1, new ComponentName(this, SyncJob.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setBackoffCriteria(30000, JobInfo.BACKOFF_POLICY_EXPONENTIAL)
                .setPersisted(true)
                .build());
  }

  void sync(Runnable finished) {
    if (!syncing.compareAndSet(false, true)) {
      if (finished != null) finished.run();
      return;
    }
    network.execute(
        () -> {
          try {
            if (store == null || cloud == null || !cloud.signedIn()) return;
            status = "Syncing";
            cloud.sync(store);
            status = "Up to date";
            blocked = false;
            reauth = false;
          } catch (CloudClient.AuthException e) {
            blocked = true;
            reauth = e.signInAgain;
            status = e.getMessage();
          } catch (Exception e) {
            status =
                e instanceof java.io.IOException
                    ? OFFLINE
                    : e instanceof org.json.JSONException
                        ? "Could not read server data. Cached entries are unchanged."
                        : e.getMessage();
          } finally {
            syncing.set(false);
            if (finished != null) finished.run();
          }
        });
  }
}
