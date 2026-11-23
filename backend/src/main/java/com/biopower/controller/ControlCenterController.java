// PURPOSE: HTTP API controller for SWARM controlcenter endpoints.
package com.biopower.controller;

import com.biopower.dto.request.ApproveUserRequest;
import com.biopower.dto.request.AssignPlantsRequest;
import com.biopower.dto.request.CompanyRequest;
import com.biopower.dto.request.DeviceChannelRequest;
import com.biopower.dto.request.DeviceLifecycleRequest;
import com.biopower.dto.request.DeviceReassignRequest;
import com.biopower.dto.request.DeviceRegisterRequest;
import com.biopower.dto.request.HmiEnabledRequest;
import com.biopower.dto.request.PlantRequest;
import com.biopower.dto.request.PlantUpdateRequest;
import com.biopower.dto.request.SuperAdminRequest;
import com.biopower.dto.response.ApiResponse;
import com.biopower.dto.response.CompanyDetailResponse;
import com.biopower.dto.response.CompanyResponse;
import com.biopower.dto.response.ControlCenterIotStatusResponse;
import com.biopower.dto.response.ControlCenterOverviewResponse;
import com.biopower.dto.response.ControlCenterUserResponse;
import com.biopower.dto.response.FieldDeviceChannelResponse;
import com.biopower.dto.response.FieldDeviceResponse;
import com.biopower.dto.response.HardwareProvisioningResponse;
import com.biopower.dto.response.PlantResponse;
import com.biopower.dto.response.UserResponse;
import com.biopower.model.entity.DeviceAuditEvent;
import com.biopower.model.enums.CompanyStatus;
import com.biopower.service.ControlCenterService;
import com.biopower.service.DeviceProvisioningService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/control-center")
@RequiredArgsConstructor
public class ControlCenterController {

    private final ControlCenterService controlCenterService;
    private final DeviceProvisioningService deviceProvisioningService;

    @GetMapping("/overview")
    public ResponseEntity<ApiResponse<ControlCenterOverviewResponse>> overview() {
        return ResponseEntity.ok(ApiResponse.success(controlCenterService.overview()));
    }

    @GetMapping("/companies")
    public ResponseEntity<ApiResponse<List<CompanyResponse>>> listCompanies() {
        return ResponseEntity.ok(ApiResponse.success(controlCenterService.listCompanies()));
    }

    @PostMapping("/companies")
    public ResponseEntity<ApiResponse<CompanyResponse>> createCompany(@Valid @RequestBody CompanyRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Company created", controlCenterService.createCompany(request)));
    }

    @GetMapping("/companies/{id}")
    public ResponseEntity<ApiResponse<CompanyDetailResponse>> getCompany(@PathVariable UUID id) {
        return ResponseEntity.ok(ApiResponse.success(controlCenterService.getCompany(id)));
    }

    @PatchMapping("/companies/{id}")
    public ResponseEntity<ApiResponse<CompanyResponse>> updateCompany(
            @PathVariable UUID id, @Valid @RequestBody CompanyRequest request) {
        return ResponseEntity.ok(ApiResponse.success(
                "Company updated", controlCenterService.updateCompany(id, request)));
    }

    @PatchMapping("/companies/{id}/disable")
    public ResponseEntity<ApiResponse<CompanyResponse>> disableCompany(@PathVariable UUID id) {
        return ResponseEntity.ok(ApiResponse.success(
                "Company disabled", controlCenterService.setCompanyStatus(id, CompanyStatus.DISABLED)));
    }

    @PatchMapping("/companies/{id}/enable")
    public ResponseEntity<ApiResponse<CompanyResponse>> enableCompany(@PathVariable UUID id) {
        return ResponseEntity.ok(ApiResponse.success(
                "Company enabled", controlCenterService.setCompanyStatus(id, CompanyStatus.ACTIVE)));
    }

    @DeleteMapping("/companies/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteCompany(@PathVariable UUID id) {
        controlCenterService.deleteCompany(id);
        return ResponseEntity.ok(ApiResponse.success("Company deleted", null));
    }

    @PostMapping("/companies/{id}/super-admin")
    public ResponseEntity<ApiResponse<UserResponse>> createSuperAdmin(
            @PathVariable UUID id, @Valid @RequestBody SuperAdminRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Super Admin created", controlCenterService.createSuperAdmin(id, request)));
    }

    @PutMapping("/companies/{id}/plants")
    public ResponseEntity<ApiResponse<CompanyDetailResponse>> assignPlants(
            @PathVariable UUID id, @Valid @RequestBody AssignPlantsRequest request) {
        return ResponseEntity.ok(ApiResponse.success(
                "Plants assigned", controlCenterService.assignPlants(id, request)));
    }

    @GetMapping("/users")
    public ResponseEntity<ApiResponse<List<ControlCenterUserResponse>>> listUsers(
            @RequestParam(name = "queue", defaultValue = "pending") String queue) {
        boolean queueOnly = !"all".equalsIgnoreCase(queue);
        return ResponseEntity.ok(ApiResponse.success(controlCenterService.listUsers(queueOnly)));
    }

    @PostMapping("/users/{id}/approve")
    public ResponseEntity<ApiResponse<ControlCenterUserResponse>> approveUser(
            @PathVariable Long id, @Valid @RequestBody ApproveUserRequest request) {
        return ResponseEntity.ok(ApiResponse.success("User approved", controlCenterService.approveUser(id, request)));
    }

    @PostMapping("/users/{id}/reject")
    public ResponseEntity<ApiResponse<ControlCenterUserResponse>> rejectUser(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success("User rejected", controlCenterService.rejectUser(id)));
    }

    @DeleteMapping("/users/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteUser(@PathVariable Long id) {
        controlCenterService.deleteUser(id);
        return ResponseEntity.ok(ApiResponse.success("User deleted", null));
    }

    @GetMapping("/plants")
    public ResponseEntity<ApiResponse<List<PlantResponse>>> listPlants() {
        return ResponseEntity.ok(ApiResponse.success(controlCenterService.listAllPlants()));
    }

    @GetMapping("/plants/unassigned")
    public ResponseEntity<ApiResponse<List<PlantResponse>>> listUnassignedPlants() {
        return ResponseEntity.ok(ApiResponse.success(controlCenterService.listUnassignedPlants()));
    }

    @PostMapping("/plants")
    public ResponseEntity<ApiResponse<PlantResponse>> createPlant(@Valid @RequestBody PlantRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Plant created", controlCenterService.createUnassignedPlant(request)));
    }

    @PatchMapping("/plants/{id}")
    public ResponseEntity<ApiResponse<PlantResponse>> updatePlant(
            @PathVariable Long id, @RequestBody PlantUpdateRequest request) {
        return ResponseEntity.ok(ApiResponse.success(
                "Plant updated", controlCenterService.updatePlant(id, request)));
    }

    @PatchMapping("/plants/{id}/hmi")
    public ResponseEntity<ApiResponse<PlantResponse>> setPlantHmi(
            @PathVariable Long id, @Valid @RequestBody HmiEnabledRequest request) {
        boolean enabled = Boolean.TRUE.equals(request.getEnabled());
        return ResponseEntity.ok(ApiResponse.success(
                enabled ? "Plant HMI enabled" : "Plant HMI disabled",
                controlCenterService.setPlantHmiEnabled(id, enabled)));
    }

    @GetMapping("/devices")
    public ResponseEntity<ApiResponse<List<FieldDeviceResponse>>> listDevices(
            @RequestParam(required = false) UUID tenantId,
            @RequestParam(required = false) Long plantId) {
        return ResponseEntity.ok(ApiResponse.success(deviceProvisioningService.listDevices(tenantId, plantId)));
    }

    @PostMapping("/devices")
    public ResponseEntity<ApiResponse<HardwareProvisioningResponse>> registerDevice(
            @Valid @RequestBody DeviceRegisterRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(
                        "Device registered. Store the secret now; it will not be shown again.",
                        deviceProvisioningService.register(request)));
    }

    @GetMapping("/devices/{id}")
    public ResponseEntity<ApiResponse<FieldDeviceResponse>> getDevice(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success(deviceProvisioningService.getDevice(id)));
    }

    @GetMapping("/devices/{id}/provisioning")
    public ResponseEntity<ApiResponse<HardwareProvisioningResponse>> getProvisioning(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success(deviceProvisioningService.getProvisioning(id)));
    }

    @PostMapping("/devices/{id}/rotate-secret")
    public ResponseEntity<ApiResponse<HardwareProvisioningResponse>> rotateSecret(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success(
                "Device secret rotated. Store it now; it will not be shown again.",
                deviceProvisioningService.rotateSecret(id)));
    }

    @PostMapping("/devices/{id}/revoke-secret")
    public ResponseEntity<ApiResponse<HardwareProvisioningResponse>> revokeSecret(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success(
                "Device credentials revoked. The device cannot publish until a new secret is issued.",
                deviceProvisioningService.revokeSecret(id)));
    }

    @PatchMapping("/devices/{id}/assignment")
    public ResponseEntity<ApiResponse<FieldDeviceResponse>> reassignDevice(
            @PathVariable Long id, @Valid @RequestBody DeviceReassignRequest request) {
        return ResponseEntity.ok(ApiResponse.success(
                "Device reassigned. Historical telemetry remains on the previous plant.",
                deviceProvisioningService.reassign(id, request)));
    }

    @PatchMapping("/devices/{id}/lifecycle")
    public ResponseEntity<ApiResponse<FieldDeviceResponse>> setDeviceLifecycle(
            @PathVariable Long id, @Valid @RequestBody DeviceLifecycleRequest request) {
        return ResponseEntity.ok(ApiResponse.success(
                "Device lifecycle updated",
                deviceProvisioningService.setLifecycle(id, request)));
    }

    @GetMapping("/devices/{id}/audit")
    public ResponseEntity<ApiResponse<List<DeviceAuditEvent>>> deviceAudit(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success(deviceProvisioningService.listAudit(id)));
    }

    @PutMapping("/devices/{id}/channels")
    public ResponseEntity<ApiResponse<FieldDeviceChannelResponse>> upsertChannel(
            @PathVariable Long id, @Valid @RequestBody DeviceChannelRequest request) {
        return ResponseEntity.ok(ApiResponse.success(
                "Channel saved", deviceProvisioningService.upsertChannel(id, request)));
    }

    @GetMapping("/iot/status")
    public ResponseEntity<ApiResponse<ControlCenterIotStatusResponse>> iotStatus() {
        return ResponseEntity.ok(ApiResponse.success(deviceProvisioningService.iotStatus()));
    }
}
