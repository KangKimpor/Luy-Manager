package com.luymanager.nativeapp;

import android.app.job.JobParameters;
import android.app.job.JobService;

public final class SyncJob extends JobService {
  @Override
  public boolean onStartJob(JobParameters parameters) {
    LuyApplication app = (LuyApplication) getApplication();
    if (app.store == null || app.cloud == null || !app.cloud.signedIn()) return false;
    app.sync(() -> jobFinished(parameters, !app.status.equals("Up to date")));
    return true;
  }

  @Override
  public boolean onStopJob(JobParameters parameters) {
    return true;
  }
}
