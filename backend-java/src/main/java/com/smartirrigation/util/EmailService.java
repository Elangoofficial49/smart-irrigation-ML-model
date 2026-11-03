package com.smartirrigation.util;

import java.io.UnsupportedEncodingException;
import java.util.Properties;
import io.github.cdimascio.dotenv.Dotenv;
import jakarta.mail.Authenticator;
import jakarta.mail.Message;
import jakarta.mail.MessagingException;
import jakarta.mail.PasswordAuthentication;
import jakarta.mail.Session;
import jakarta.mail.Transport;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;

/**
 * Robust Email Service supporting SMTP (Gmail, Outlook, AWS SES, Brevo, custom SMTP)
 * with dynamic .env reloading, full TLS/SSL socket support, connection timeouts,
 * and structured error diagnostics.
 */
public class EmailService {

    public static class EmailResult {
        public final boolean success;
        public final boolean isDevMode;
        public final String message;

        public EmailResult(boolean success, boolean isDevMode, String message) {
            this.success = success;
            this.isDevMode = isDevMode;
            this.message = message;
        }
    }

    /**
     * Attempts to send a 6-digit OTP verification email to the user's registered email address.
     * Dynamically reads current .env so changes take effect without server restart.
     */
    public static EmailResult sendOtpEmail(String recipientEmail, String otpCode) {
        Dotenv dotenv = Dotenv.configure()
                .directory(System.getProperty("user.dir"))
                .ignoreIfMissing()
                .load();

        String host = dotenv.get("SMTP_HOST");
        String port = dotenv.get("SMTP_PORT", "587");
        String user = dotenv.get("SMTP_USER");
        String password = dotenv.get("SMTP_PASSWORD");
        String from = dotenv.get("SMTP_FROM", (user != null && !user.isBlank()) ? user : "noreply@smartirrigation.com");

        // Clean up from address if it contains angle brackets
        if (from != null && from.contains("<") && from.contains(">")) {
            int start = from.indexOf('<') + 1;
            int end = from.indexOf('>');
            from = from.substring(start, end).trim();
        }

        // Check if SMTP is configured
        if (host == null || host.isBlank() || user == null || user.isBlank() || password == null || password.isBlank()) {
            System.out.println("==================================================================");
            System.out.println("[DEV MODE] SMTP not configured in .env. Password Reset OTP Details:");
            System.out.println("  Recipient : " + recipientEmail);
            System.out.println("  OTP Code  : " + otpCode);
            System.out.println("  Expires In: 10 minutes");
            System.out.println("  (To enable real inbox delivery, add SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD in .env)");
            System.out.println("==================================================================");
            return new EmailResult(true, true, "Dev mode: SMTP not configured in .env. OTP displayed in console.");
        }

        try {
            Properties props = new Properties();
            props.put("mail.smtp.auth", "true");
            props.put("mail.smtp.host", host);
            props.put("mail.smtp.port", port);
            props.put("mail.smtp.connectiontimeout", "8000");
            props.put("mail.smtp.timeout", "8000");
            props.put("mail.smtp.writetimeout", "8000");
            props.put("mail.smtp.ssl.trust", "*");

            if ("465".equals(port)) {
                props.put("mail.smtp.ssl.enable", "true");
                props.put("mail.smtp.socketFactory.port", port);
                props.put("mail.smtp.socketFactory.class", "javax.net.ssl.SSLSocketFactory");
            } else {
                props.put("mail.smtp.starttls.enable", "true");
                props.put("mail.smtp.starttls.required", "true");
                props.put("mail.smtp.ssl.protocols", "TLSv1.2 TLSv1.3");
            }

            final String authUser = user;
            final String authPass = password;

            Session session = Session.getInstance(props, new Authenticator() {
                @Override
                protected PasswordAuthentication getPasswordAuthentication() {
                    return new PasswordAuthentication(authUser, authPass);
                }
            });

            Message message = new MimeMessage(session);
            message.setFrom(new InternetAddress(from != null ? from : authUser, "AgroPulse"));
            message.setRecipients(Message.RecipientType.TO, InternetAddress.parse(recipientEmail));
            message.setSubject("Your Password Reset Code - AgroPulse");

            String htmlBody = buildOtpHtmlEmail(otpCode);
            message.setContent(htmlBody, "text/html; charset=utf-8");

            Transport.send(message);
            System.out.println("[EmailService] Real inbox email delivered successfully via SMTP (" + host + ") to " + recipientEmail);
            return new EmailResult(true, false, "Email delivered to " + recipientEmail);

        } catch (MessagingException | UnsupportedEncodingException e) {
            String errorMsg = e.getMessage();
            System.err.println("[EmailService] SMTP Dispatch Failed: " + errorMsg);
            System.out.println("==================================================================");
            System.out.println("[FALLBACK OTP] For " + recipientEmail + ": " + otpCode);
            System.out.println("==================================================================");
            return new EmailResult(false, false, "SMTP delivery failed (" + errorMsg + "). Check your SMTP credentials in .env.");
        }
    }

    private static String buildOtpHtmlEmail(String otpCode) {
        return "<!DOCTYPE html>"
                + "<html>"
                + "<head>"
                + "<meta charset='UTF-8'>"
                + "<meta name='viewport' content='width=device-width, initial-scale=1.0'>"
                + "<style>"
                + "body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F6F8F5; margin: 0; padding: 20px; color: #17231D; }"
                + ".container { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #E1E7E1; }"
                + ".header { background: #163D2B; padding: 24px; text-align: left; color: #ffffff; }"
                + ".header h1 { margin: 0; font-size: 18px; font-weight: 700; letter-spacing: -0.2px; }"
                + ".header p { margin: 4px 0 0; font-size: 12px; opacity: 0.8; }"
                + ".content { padding: 28px 24px; }"
                + ".otp-box { background: #E8F0E8; border: 1px solid #E1E7E1; border-radius: 6px; padding: 18px; text-align: center; margin: 24px 0; }"
                + ".otp-code { font-family: 'Courier New', monospace; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #163D2B; margin: 0; }"
                + ".validity { font-size: 12px; color: #69766D; margin-top: 8px; }"
                + ".note { font-size: 13px; color: #69766D; line-height: 1.6; margin: 20px 0; }"
                + ".footer { background: #F6F8F5; padding: 16px 24px; text-align: center; font-size: 12px; color: #69766D; border-top: 1px solid #E1E7E1; }"
                + "</style>"
                + "</head>"
                + "<body>"
                + "<div class='container'>"
                + "  <div class='header'>"
                + "    <h1>AgroPulse</h1>"
                + "    <p>Precision Irrigation Management</p>"
                + "  </div>"
                + "  <div class='content'>"
                + "    <h2 style='font-size: 16px; margin-top: 0; color: #17231D;'>Password Reset Request</h2>"
                + "    <p style='font-size: 14px; color: #17231D; line-height: 1.5;'>We received a request to reset the password for your AgroPulse account. Use the one-time verification code below to proceed:</p>"
                + "    <div class='otp-box'>"
                + "      <div class='otp-code'>" + otpCode + "</div>"
                + "      <div class='validity'>Valid for 10 minutes</div>"
                + "    </div>"
                + "    <p class='note'>If you did not request this password reset, please ignore this email. Your password will remain unchanged.</p>"
                + "  </div>"
                + "  <div class='footer'>"
                + "    &copy; AgroPulse &bull; agropulse.farm"
                + "  </div>"
                + "</div>"
                + "</body>"
                + "</html>";
    }
}
