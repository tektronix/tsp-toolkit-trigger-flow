import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatExpansionModule } from '@angular/material/expansion';

@NgModule({
  imports: [BrowserModule, BrowserAnimationsModule, MatExpansionModule],
  exports: [MatExpansionModule]
})
export class MaterialModule {}
