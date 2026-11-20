package com.luymanager.nativeapp;

import static org.junit.Assert.*;

import org.junit.Test;

/** The keying rules mirror `pressAmountKey` in src/components/amount-keypad.tsx. */
public class KeypadTest {
  static String type(String... keys) {
    String raw = "";
    for (String key : keys) raw = MainActivity.pressAmountKey(raw, key);
    return raw;
  }

  @Test
  public void rielKeepsTwoDecimalsAndTheThousandsShortcut() {
    String[][] rows = MainActivity.keypadRows("KHR");
    assertArrayEquals(new String[] {".", "0", "000", "del"}, rows[3]);
    assertArrayEquals(new String[] {".", "0", "del"}, MainActivity.keypadRows("USD")[3]);
    assertEquals("9993.55", type("9", "9", "9", "3", ".", "5", "5"));
  }

  @Test
  public void thousandsKeyAppendsOnlyToAWholeAmount() {
    assertEquals("12000", type("1", "2", "000"));
    assertEquals("0", type("000"));
    // "1.5000" would be refused on save, so the key does nothing after a decimal point.
    assertEquals("1.5", type("1", ".", "5", "000"));
  }

  @Test
  public void refusesAThirdDecimalAndALeadingZero() {
    assertEquals("12.50", type("1", "2", ".", "5", "0", "9"));
    assertEquals("5", type("0", "5"));
    assertEquals("0.", type("."));
    assertEquals("0.", type(".", "."));
  }

  @Test
  public void refusesAnAmountTheLedgerCannotHold() {
    String raw = "90071992547409";
    assertEquals(raw, MainActivity.pressAmountKey(raw, "9"));
    assertEquals(raw, MainActivity.pressAmountKey(raw, "000"));
  }

  @Test
  public void deleteRemovesOneCharacterAndStopsAtEmpty() {
    assertEquals("12.", MainActivity.pressAmountKey("12.5", "del"));
    assertEquals("", MainActivity.pressAmountKey("", "del"));
  }
}
