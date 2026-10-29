package com.luymanager.nativeapp;

import static org.junit.Assert.*;

import java.math.BigDecimal;
import org.junit.Test;

public class MoneyTest {
  @Test
  public void exactAmountsIncludeFractionalRiel() {
    assertEquals(999355L, Money.parse("9993.55"));
    assertEquals(30L, Money.add(Money.parse("0.10"), Money.parse("0.20")));
    assertEquals(1200000L, Money.parse("12000"));
    long sum = 0;
    for (int i = 0; i < 1000; i++) sum = Money.add(sum, 1);
    assertEquals(1000L, sum);
  }

  @Test
  public void conversionsRoundSymmetrically() {
    BigDecimal rate = new BigDecimal("4100");
    assertEquals(1230000L, Money.convert(300, "USD", "KHR", rate));
    assertEquals(1L, Money.convert(2050, "KHR", "USD", rate));
    assertEquals(-1L, Money.convert(-2050, "KHR", "USD", rate));
  }

  @Test
  public void displayMatchesTheWebFormat() {
    assertEquals("$1,234.50", Money.display(123450, "USD"));
    assertEquals("-$0.05", Money.display(-5, "USD"));
    assertEquals("12,500៛", Money.display(1250000, "KHR"));
    assertEquals("-9,993.55៛", Money.display(-999355, "KHR"));
  }

  @Test
  public void invalidOrOversizedAmountsAreRejected() {
    assertThrows(IllegalArgumentException.class, () -> Money.parse("2.005"));
    assertThrows(IllegalArgumentException.class, () -> Money.parse("-1"));
    assertThrows(IllegalArgumentException.class, () -> Money.parse("90071992547410.00"));
    assertThrows(IllegalArgumentException.class, () -> Money.currency("EUR"));
  }
}
