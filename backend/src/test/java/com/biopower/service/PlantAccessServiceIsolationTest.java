// PURPOSE: Tenant isolation for plant-app device access.
package com.biopower.service;

import com.biopower.model.entity.Device;
import com.biopower.model.entity.Plant;
import com.biopower.model.entity.User;
import com.biopower.model.enums.UserRole;
import com.biopower.model.enums.UserStatus;
import com.biopower.repository.UserRepository;
import com.biopower.security.UserPrincipal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PlantAccessServiceIsolationTest {

    @Mock UserRepository userRepository;
    PlantAccessService service;
    UUID tenantA;
    UUID tenantB;
    User user;
    UserPrincipal principal;

    @BeforeEach
    void setUp() {
        service = new PlantAccessService(userRepository);
        tenantA = UUID.fromString("11111111-1111-4111-8111-111111111111");
        tenantB = UUID.fromString("22222222-2222-4222-8222-222222222222");
        Plant plant = Plant.builder().plantId(7L).plantName("A1").build();
        user = User.builder()
                .id(3L)
                .email("admin@a.test")
                .password("x")
                .name("Admin")
                .role(UserRole.SUPER_ADMIN)
                .status(UserStatus.ACTIVE)
                .assignedPlants(Set.of(plant))
                .assignedSensorNodes(Set.of())
                .build();
        principal = new UserPrincipal(
                3L, "Admin", "admin@a.test", "x",
                List.of(new SimpleGrantedAuthority("ROLE_SUPER_ADMIN")),
                true, List.of(7L), List.of(), tenantA);
        when(userRepository.findById(3L)).thenReturn(Optional.of(user));
    }

    @Test
    void sameTenantDeviceIsAllowed() {
        Device device = Device.builder().id(11L).plantId(7L).tenantId(tenantA).deviceUid("D1").build();
        assertDoesNotThrow(() -> service.assertCanAccessDevice(principal, device));
    }

    @Test
    void otherTenantDeviceIsDeniedEvenOnGuessedPlant() {
        Device device = Device.builder().id(12L).plantId(7L).tenantId(tenantB).deviceUid("D2").build();
        assertThrows(AccessDeniedException.class, () -> service.assertCanAccessDevice(principal, device));
    }
}
