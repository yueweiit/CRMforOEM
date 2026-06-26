import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentUser, RequestUser } from "../../common/auth/current-user.decorator";
import { AssignCustomerDto } from "./dto/assign-customer.dto";
import { ChangeCustomerStageDto } from "./dto/change-customer-stage.dto";
import { CreateContactDto } from "./dto/create-contact.dto";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { UpdateContactDto } from "./dto/update-contact.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";
import { CustomersService } from "./customers.service";

@Controller("customers")
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Query("stage") stage?: string, @Query("q") q?: string) {
    return this.customersService.list(user, { stage, q });
  }

  @Get("filter-options")
  filterOptions(@CurrentUser() user: RequestUser) {
    return this.customersService.filterOptions(user);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateCustomerDto) {
    return this.customersService.create(user, dto);
  }

  @Get(":id")
  get(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.customersService.get(user, id);
  }

  @Patch(":id")
  update(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: UpdateCustomerDto) {
    return this.customersService.update(user, id, dto);
  }

  @Post(":id/assign")
  assign(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: AssignCustomerDto) {
    return this.customersService.assign(user, id, dto);
  }

  @Post(":id/stage")
  changeStage(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: ChangeCustomerStageDto) {
    return this.customersService.changeStage(user, id, dto);
  }

  @Get(":id/timeline")
  timeline(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.customersService.timeline(user, id);
  }

  @Post(":id/contacts")
  createContact(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: CreateContactDto) {
    return this.customersService.createContact(user, id, dto);
  }

  @Patch(":id/contacts/:contactId")
  updateContact(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Param("contactId") contactId: string,
    @Body() dto: UpdateContactDto
  ) {
    return this.customersService.updateContact(user, id, contactId, dto);
  }

  @Delete(":id/contacts/:contactId")
  deleteContact(@CurrentUser() user: RequestUser, @Param("id") id: string, @Param("contactId") contactId: string) {
    return this.customersService.deleteContact(user, id, contactId);
  }
}
