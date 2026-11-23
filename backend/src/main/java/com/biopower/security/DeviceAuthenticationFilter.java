// PURPOSE: Authentication/authorization component for SWARM API security.
package com.biopower.security;

import com.biopower.model.entity.Device;
import com.biopower.repository.DeviceRepository;
import com.biopower.util.DeviceSecretHasher;
import com.biopower.util.DeviceStatuses;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * Optional device authentication for /iot/**.
 * Headers: X-SWARM-Device-Id + X-SWARM-Device-Secret
 * or Authorization: Device &lt;deviceUid&gt;:&lt;secret&gt;
 * Absence is allowed through so TelemetryIngestService can apply legacy-compat rules.
 */
@Component
@RequiredArgsConstructor
public class DeviceAuthenticationFilter extends OncePerRequestFilter {

    public static final String HEADER_DEVICE_ID = "X-SWARM-Device-Id";
    public static final String HEADER_DEVICE_SECRET = "X-SWARM-Device-Secret";

    private final DeviceRepository deviceRepository;
    private final ObjectMapper objectMapper;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getServletPath();
        return path == null || !path.startsWith("/iot/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String deviceUid = request.getHeader(HEADER_DEVICE_ID);
        String secret = request.getHeader(HEADER_DEVICE_SECRET);

        if (!StringUtils.hasText(deviceUid) || !StringUtils.hasText(secret)) {
            String[] fromAuth = parseDeviceAuthorization(request.getHeader("Authorization"));
            if (fromAuth != null) {
                deviceUid = fromAuth[0];
                secret = fromAuth[1];
            }
        }

        if (StringUtils.hasText(deviceUid) && StringUtils.hasText(secret)) {
            final String presentedSecret = secret.trim();
            Optional<Device> deviceOpt = deviceRepository.findByDeviceUid(deviceUid.trim()).stream()
                    .filter(d -> DeviceSecretHasher.matches(presentedSecret, d.getSecretHash()))
                    .findFirst();
            if (deviceOpt.isEmpty()) {
                if (deviceRepository.findFirstByDeviceUid(deviceUid.trim()).isEmpty()) {
                    writeUnauthorized(response, "Unknown device");
                } else {
                    writeUnauthorized(response, "Invalid device credentials");
                }
                return;
            }
            Device device = deviceOpt.get();
            if (!DeviceStatuses.canPublish(device)) {
                writeUnauthorized(response, "Device is " + device.getLifecycle());
                return;
            }
            if (!DeviceSecretHasher.matches(secret.trim(), device.getSecretHash())) {
                writeUnauthorized(response, "Invalid device credentials");
                return;
            }
            DevicePrincipal principal = new DevicePrincipal(
                    device.getId(),
                    device.getDeviceUid(),
                    device.getPlantId(),
                    device.getTenantId(),
                    device.getChipId(),
                    device.getDeviceKind(),
                    device.isLegacyCompat(),
                    device.getConfigVersion()
            );
            SecurityContextHolder.getContext().setAuthentication(principal);
        }

        filterChain.doFilter(request, response);
    }

    private String[] parseDeviceAuthorization(String header) {
        if (!StringUtils.hasText(header)) {
            return null;
        }
        String value = header.trim();
        if (value.toLowerCase(Locale.ROOT).startsWith("device ")) {
            String token = value.substring(7).trim();
            int colon = token.indexOf(':');
            if (colon > 0 && colon < token.length() - 1) {
                return new String[]{token.substring(0, colon), token.substring(colon + 1)};
            }
        }
        return null;
    }

    private void writeUnauthorized(HttpServletResponse response, String message) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        objectMapper.writeValue(response.getOutputStream(), Map.of(
                "success", false,
                "message", message
        ));
    }
}
