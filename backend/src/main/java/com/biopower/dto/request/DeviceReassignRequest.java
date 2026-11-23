// PURPOSE: Request DTO for Control Center device reassignment.
package com.biopower.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.UUID;

@Data
public class DeviceReassignRequest {
    /** Optional. Must match the destination plant's tenant when sent. */
    private UUID tenantId;
    @NotNull
    private Long plantId;
}
