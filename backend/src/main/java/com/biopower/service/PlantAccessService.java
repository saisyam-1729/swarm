// PURPOSE: Application service implementing SWARM plantaccess business rules.
package com.biopower.service;

import com.biopower.model.entity.Device;
import com.biopower.model.entity.Plant;
import com.biopower.model.entity.SensorNode;
import com.biopower.repository.UserRepository;
import com.biopower.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class PlantAccessService {

    private final UserRepository userRepository;

    public boolean isControlCenterAdmin(UserPrincipal principal) {
        return hasRole(principal, "ROLE_CONTROL_CENTER_ADMIN");
    }

    public boolean isSuperAdmin(UserPrincipal principal) {
        return hasRole(principal, "ROLE_SUPER_ADMIN");
    }

    public boolean isPlantAdmin(UserPrincipal principal) {
        return hasRole(principal, "ROLE_PLANT_ADMIN");
    }

    public boolean isOperator(UserPrincipal principal) {
        return hasRole(principal, "ROLE_OPERATOR");
    }

    public boolean canManageUsers(UserPrincipal principal) {
        return isSuperAdmin(principal) || isPlantAdmin(principal);
    }

    public void assertPlantAppUser(UserPrincipal principal) {
        if (isControlCenterAdmin(principal)) {
            throw new AccessDeniedException("Control Center admins must use Control Center");
        }
    }

    public void assertCanAccessPlant(UserPrincipal principal, Long plantId) {
        assertPlantAppUser(principal);
        if (plantId == null || !resolveAccessiblePlantIds(principal).contains(plantId)) {
            throw new AccessDeniedException("You do not have access to this plant");
        }
    }

    public boolean canAccessDevice(UserPrincipal principal, Device device) {
        if (device == null) {
            return false;
        }
        try {
            assertCanAccessDevice(principal, device);
            return true;
        } catch (Exception ex) {
            return false;
        }
    }

    public void assertCanAccessDevice(UserPrincipal principal, Device device) {
        if (device == null) {
            throw new AccessDeniedException("You do not have access to this device");
        }
        assertCanAccessPlant(principal, device.getPlantId());
        if (principal.getCompanyId() != null && device.getTenantId() != null
                && !principal.getCompanyId().equals(device.getTenantId())) {
            throw new AccessDeniedException("You do not have access to this device");
        }
    }

    public boolean shouldFilterSensorsForOperator(UserPrincipal principal) {
        List<Long> nodeIds = resolveAssignedNodeIds(principal);
        return isOperator(principal) && nodeIds != null && !nodeIds.isEmpty();
    }

    @Transactional(readOnly = true)
    public List<Long> resolveAccessiblePlantIds(UserPrincipal principal) {
        if (isControlCenterAdmin(principal)) {
            return List.of();
        }
        return userRepository.findById(principal.getId())
                .map(user -> user.getAssignedPlants().stream()
                        .map(Plant::getPlantId)
                        .collect(Collectors.toList()))
                .orElse(principal.getPlantIds() != null ? principal.getPlantIds() : List.of());
    }

    @Transactional(readOnly = true)
    public List<Long> resolveAssignedNodeIds(UserPrincipal principal) {
        if (!isOperator(principal)) {
            return null;
        }
        return userRepository.findById(principal.getId())
                .map(user -> user.getAssignedSensorNodes().stream()
                        .map(SensorNode::getNodeId)
                        .collect(Collectors.toList()))
                .orElse(principal.getNodeIds() != null ? principal.getNodeIds() : List.of());
    }

    private boolean hasRole(UserPrincipal principal, String role) {
        return principal.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals(role));
    }
}
