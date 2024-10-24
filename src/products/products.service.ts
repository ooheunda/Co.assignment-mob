import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Product } from '../common/entities/product.entity';
import { UserPayload } from '../common/types/user-payload.type';
import { UserType } from '../common/types/user-type.enum';

import { ProductQueryDto } from './dto/product-query.dto';
import { ProductResponseDto } from './dto/product-response.dto';

@Injectable()
export class ProductsService {
  constructor(@InjectRepository(Product) private readonly productRepository: Repository<Product>) {}

  async findAll(user: UserPayload | null, queries: ProductQueryDto): Promise<ProductResponseDto[]> {
    const rawProducts = await this.getRawProducts(queries);
    return rawProducts.map((rawProduct) => this.getArrangedProductObj(rawProduct, user));
  }

  private async getRawProducts(queries: ProductQueryDto): Promise<Product[]> {
    const { brand, page, pageCount } = queries;

    const queryBuilder = this.productRepository
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.brand', 'b')
      .leftJoinAndSelect('p.productPrices', 'pp');

    // 브랜드 이름으로 검색 시 해당 브랜드 상품 조회
    if (brand) {
      queryBuilder.where('p.brand LIKE :brand', { brand: `${brand}%` });
    }

    const products = await queryBuilder
      .orderBy('p.createdAt', 'DESC')
      .skip((+page - 1) * +pageCount)
      .take(+pageCount)
      .getMany();

    return products;
  }

  private getArrangedProductObj(rawProduct: Product, user: UserPayload): ProductResponseDto {
    const product = {
      name: rawProduct.name,
      description: rawProduct.description,
      category: rawProduct.category,
      brandName: rawProduct.brand.name,
      brandDescription: rawProduct.brand.description,
      createdAt: rawProduct.createdAt,
      updatedAt: rawProduct.updatedAt,
    } as ProductResponseDto;

    if (user === null) {
      return product;
    } else {
      // 로그인 한 경우에만 가격 정보 포함
      const priceInfo = this.getProductPriceInfo(rawProduct, user.type);

      return {
        ...priceInfo,
        ...product,
      };
    }
  }

  private getProductPriceInfo(rawProduct: Product, userType: UserType): Partial<ProductResponseDto> {
    let discountRateByType = 0;

    rawProduct.productPrices.forEach((pp) => {
      if (pp.userType === userType) {
        discountRateByType = pp.discountRate;
      }
    });

    let totalDiscountRate = discountRateByType + rawProduct.discountRate;

    // 월요일에는 할인율 1% 증가
    if (new Date().getDay() === 1) {
      totalDiscountRate += 0.1;
    }

    return {
      basePrice: rawProduct.basePrice,
      discountedPrice: rawProduct.basePrice - rawProduct.basePrice * totalDiscountRate,
      discountRate: totalDiscountRate,
    };
  }
}
