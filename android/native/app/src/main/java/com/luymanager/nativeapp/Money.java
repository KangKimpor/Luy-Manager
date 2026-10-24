package com.luymanager.nativeapp;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.NumberFormat;
import java.util.Locale;

final class Money {
  static final long MAX_MINOR = 9007199254740991L;

  static String currency(String value) {
    if (!value.equals("USD") && !value.equals("KHR"))
      throw new IllegalArgumentException("Unknown currency");
    return value;
  }

  static long checked(long minor) {
    if (minor > MAX_MINOR || minor < -MAX_MINOR)
      throw new IllegalArgumentException("Amount is too large");
    return minor;
  }

  static long parse(String text) {
    if (!text.matches("[0-9]+(?:\\.[0-9]{1,2})?"))
      throw new IllegalArgumentException("Enter an amount with up to two decimal places");
    return checked(new BigDecimal(text).movePointRight(2).longValueExact());
  }

  static long add(long a, long b) {
    return checked(Math.addExact(a, b));
  }

  static long convert(long minor, String from, String to, BigDecimal usdKhr) {
    currency(from);
    currency(to);
    if (from.equals(to)) return checked(minor);
    if (usdKhr.signum() <= 0) throw new IllegalArgumentException("Invalid exchange rate");
    BigDecimal value = BigDecimal.valueOf(minor);
    return checked(
        (from.equals("USD")
                ? value.multiply(usdKhr)
                : value.divide(usdKhr, 0, RoundingMode.HALF_UP))
            .setScale(0, RoundingMode.HALF_UP)
            .longValueExact());
  }

  static String decimal(long minor) {
    return BigDecimal.valueOf(checked(minor), 2).toPlainString();
  }

  static String format(long minor, String currency) {
    currency(currency);
    NumberFormat f = NumberFormat.getNumberInstance(Locale.US);
    f.setMinimumFractionDigits(2);
    f.setMaximumFractionDigits(2);
    String n = f.format(BigDecimal.valueOf(Math.abs(checked(minor)), 2));
    return (minor < 0 ? "-" : "") + (currency.equals("USD") ? "$" + n : n + " KHR");
  }
}
