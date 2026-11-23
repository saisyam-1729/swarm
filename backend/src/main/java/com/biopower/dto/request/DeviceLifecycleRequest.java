// PURPOSE: Request DTO for Control Center device suspend / reactivate / retire.
package com.biopower.dto.request;

import com.biopower.model.enums.DeviceLifecycle;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class DeviceLifecycleRequest {
    @NotNull
    private DeviceLifecycle lifecycle;
}
