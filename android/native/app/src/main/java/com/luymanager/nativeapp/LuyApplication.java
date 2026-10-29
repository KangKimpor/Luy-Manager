package com.luymanager.nativeapp;

import android.app.Application;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class LuyApplication extends Application {
  final ExecutorService worker = Executors.newSingleThreadExecutor();
  final ExecutorService network = Executors.newSingleThreadExecutor();
  private final java.util.concurrent.atomic.AtomicBoolean syncing =
      new java.util.concurrent.atomic.AtomicBoolean();
  volatile CloudClient cloud;
  volatile LedgerStore store;
  volatile String status = "Ready";

  @Override
  public void onCreate() {
    super.onCreate();
    try {
      cloud = new CloudClient(new SessionVault(this));
      if (cloud.signedIn()) store = new LedgerStore(this, cloud.owner());
    } catch (Exception e) {
      status = "Secure session unavailable. Sign in again.";
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
          } catch (Exception e) {
            status =
                e instanceof java.io.IOException
                    ? "Connection unavailable. Entries are saved on this phone."
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
