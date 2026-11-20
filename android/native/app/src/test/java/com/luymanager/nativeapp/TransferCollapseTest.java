package com.luymanager.nativeapp;

import static org.junit.Assert.*;

import java.util.ArrayList;
import java.util.Arrays;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

// org.json is a stub under plain JUnit, so these run on Robolectric's real implementation.
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class TransferCollapseTest {
  static JSONObject row(String id, long amount, String group) throws Exception {
    return new JSONObject()
        .put("id", id)
        .put("amount", amount)
        .put("transfer_group_id", group == null ? JSONObject.NULL : group);
  }

  @Test
  public void keepsTheLegThatLeftTheAccount() throws Exception {
    JSONObject in = row("in", 5000, "g1");
    JSONObject out = row("out", -5000, "g1");
    JSONObject plain = row("plain", -100, null);
    ArrayList<JSONObject> kept =
        MainActivity.collapseTransfers(Arrays.asList(in, plain, out));
    assertEquals(Arrays.asList(plain, out), kept);
  }

  @Test
  public void keepsTheSurvivingLegWhenFilteredToDestination() throws Exception {
    JSONObject in = row("in", 5000, "g1");
    assertEquals(Arrays.asList(in), MainActivity.collapseTransfers(Arrays.asList(in)));
  }
}
